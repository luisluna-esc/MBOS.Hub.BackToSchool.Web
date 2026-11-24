import { Icon } from '../../../shared/components/icon/icon';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DialogService } from '../../../core/dialog/dialog.service';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatMoney } from '../../../core/format/money';
import {
  FormCourse,
  FormGarment,
  FormProduct,
  Order,
  OrderForm,
  OrderLineRequest,
  ProductSection,
} from '../../../core/sales/sales.models';
import { SalesService, apiError } from '../../../core/sales/sales.service';
import { ToastService } from '../../../core/toast/toast.service';
import { FIELD_RULES, customerNameError, manualTextError, phoneError, taxIdError } from '../../../core/forms/field-rules';
import { AllowedCharsDirective } from '../../../shared/directives/allowed-chars.directive';
import { NumberOnlyDirective } from '../../../shared/directives/number-only.directive';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { Select, SelectOption } from '../../../shared/components/select/select';

type Step = 'customer' | 'texts' | 'uniforms' | 'notebooks' | 'others' | 'summary';

interface ManualLine {
  key: number;
  description: string;
  price: number;
  quantity: number;
}

/** Un hijo del papá: su curso, qué textos de la lista lleva y lo que se agregó aparte. */
interface StudentDraft {
  key: number;
  label: string;
  courseId: number | null;
  /** Textos de la lista del curso que van marcados. */
  selected: number[];
  /** Textos del catálogo que no están en la lista del curso. */
  extras: number[];
  /** Textos escritos a mano (nombre y precio los dicta el promotor). */
  manual: ManualLine[];
}

interface Draft {
  customerName: string;
  taxId: string;
  phone: string;
  schoolId: number | null;
  notes: string;
  students: StudentDraft[];
  /** Cuadernos, uniformes (cada talla es un producto) y otros: productId → cantidad. */
  cart: Record<number, number>;
}

interface IndexedProduct {
  productId: number;
  code: string | null;
  name: string;
  price: number;
  stock: number;
  section: ProductSection;
  garment?: string;
  size?: string;
}

interface SummaryLine {
  key: string;
  group: string;
  name: string;
  detail: string | null;
  quantity: number;
  price: number;
  manual: boolean;
  /** Para quitar o cambiar la cantidad desde el resumen. */
  cartProductId?: number;
}

/** Clave donde versiones anteriores guardaban el borrador (solo para limpiarla). */
const LEGACY_DRAFT_KEY = 'orderDraft';
let nextKey = 1;

function emptyDraft(): Draft {
  return { customerName: '', taxId: '', phone: '', schoolId: null, notes: '', students: [], cart: {} };
}

@Component({
  selector: 'app-order-create',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, ErrorState, Icon, Select, AllowedCharsDirective, NumberOnlyDirective],
  templateUrl: './order-create.html',
})
export class OrderCreate {
  private readonly salesService = inject(SalesService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(DialogService);

  protected readonly money = formatMoney;

  protected readonly form = signal<OrderForm | null>(null);
  protected readonly loading = signal(true);
  protected readonly errorCode = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly created = signal<Order | null>(null);

  protected readonly step = signal<Step>('customer');
  protected readonly draft = signal<Draft>(emptyDraft());
  protected readonly rules = FIELD_RULES;
  /** Campos de "Datos" que ya se tocaron (sus errores se muestran desde ahí, no mientras se escribe la primera vez). */
  protected readonly touched = signal<ReadonlySet<string>>(new Set());
  protected readonly customerErrors = computed(() => {
    const d = this.draft();
    return {
      customerName: customerNameError(d.customerName),
      taxId: taxIdError(d.taxId),
      phone: phoneError(d.phone),
      notes: d.notes.length > FIELD_RULES.notes.max ? `Máximo ${FIELD_RULES.notes.max} caracteres.` : null,
    };
  });
  protected readonly customerValid = computed(() => Object.values(this.customerErrors()).every((e) => !e));
  /** Error del texto escrito a mano que se está agregando. */
  protected readonly manualError = signal<string | null>(null);

  /** Error de un campo de "Datos", solo si ya se tocó. */
  protected fieldError(field: 'customerName' | 'taxId' | 'phone' | 'notes'): string | null {
    return this.touched().has(field) ? this.customerErrors()[field] : null;
  }

  protected touch(field: string): void {
    if (!this.touched().has(field)) {
      this.touched.update((t) => new Set([...t, field]));
    }
  }

  private touchAll(): void {
    this.touched.set(new Set(['customerName', 'taxId', 'phone', 'notes']));
  }

  // Búsquedas y paneles abiertos
  protected readonly openGarment = signal<string | null>(null);
  protected readonly searchNotebook = signal('');
  protected readonly searchOther = signal('');
  protected readonly searchUniform = signal('');
  /** Hijo al que se le está buscando un texto del catálogo (o null). */
  protected readonly extraSearchFor = signal<number | null>(null);
  protected readonly extraSearch = signal('');
  /** Hijo al que se le está escribiendo un texto a mano (o null). */
  protected readonly manualFor = signal<number | null>(null);
  protected manualName = '';
  protected manualPrice: number | null = null;

  protected readonly steps: { id: Step; label: string }[] = [
    { id: 'customer', label: 'Datos' },
    { id: 'texts', label: 'Textos' },
    { id: 'uniforms', label: 'Uniformes' },
    { id: 'notebooks', label: 'Cuadernos' },
    { id: 'others', label: 'Otros' },
    { id: 'summary', label: 'Resumen' },
  ];

  /** Todos los productos por id, para precios y nombres. */
  private readonly index = computed(() => {
    const map = new Map<number, IndexedProduct>();
    const form = this.form();
    if (!form) {
      return map;
    }
    const add = (p: FormProduct, section: ProductSection) => map.set(p.productId, { ...p, section });
    form.texts.forEach((p) => add(p, 'TEXT'));
    form.courses.forEach((c) => c.items.forEach((p) => map.has(p.productId) || add(p, 'OTHER')));
    form.notebooks.forEach((p) => add(p, 'NOTEBOOK'));
    form.others.forEach((p) => add(p, 'OTHER'));
    form.garments.forEach((g) =>
      g.sizes.forEach((s) =>
        map.set(s.productId, {
          productId: s.productId,
          code: s.code,
          name: g.garmentName,
          price: s.price,
          stock: s.stock,
          section: 'UNIFORM',
          garment: g.garmentName,
          size: s.size,
        })
      )
    );
    return map;
  });

  /** Cursos para el select, en el orden del formulario (Pre Inicial … 6to Secundaria). */
  protected readonly courseOptions = computed<SelectOption[]>(() =>
    (this.form()?.courses ?? []).map((c) => ({ value: String(c.courseId), label: c.name }))
  );

  private readonly courses = computed(() => new Map((this.form()?.courses ?? []).map((c) => [c.courseId, c])));

  protected readonly garmentGroups = computed(() => {
    const search = this.searchUniform().trim().toLowerCase();
    const groups = new Map<string, FormGarment[]>();
    for (const garment of this.form()?.garments ?? []) {
      if (search && !garment.garmentName.toLowerCase().includes(search)) {
        continue;
      }
      const label = garment.group === 'UNIFORME ALTERNATIVO' ? 'Uniforme alternativo (tallas de adulto)' : 'Uniforme escolar';
      groups.set(label, [...(groups.get(label) ?? []), garment]);
    }
    return [...groups.entries()].map(([label, garments]) => ({ label, garments }));
  });

  protected readonly notebooks = computed(() => this.filterProducts(this.form()?.notebooks ?? [], this.searchNotebook()));
  protected readonly others = computed(() => this.filterProducts(this.form()?.others ?? [], this.searchOther()));
  protected readonly extraResults = computed(() => {
    const search = this.extraSearch().trim();
    return search.length < 2 ? [] : this.filterProducts(this.form()?.texts ?? [], search).slice(0, 15);
  });

  /** Todas las líneas del pedido, ya con precio: alimentan el resumen, el total y el envío. */
  protected readonly lines = computed<SummaryLine[]>(() => {
    const draft = this.draft();
    const index = this.index();
    const lines: SummaryLine[] = [];

    for (const student of draft.students) {
      const course = student.courseId ? this.courses().get(student.courseId) : undefined;
      const group = `${student.label}${course ? ` · ${course.name}` : ''}`;
      for (const id of [...student.selected, ...student.extras]) {
        const product = index.get(id);
        if (product) {
          lines.push({ key: `s${student.key}-${id}`, group, name: product.name, detail: product.code, quantity: 1, price: product.price, manual: false });
        }
      }
      for (const manual of student.manual) {
        lines.push({ key: `m${manual.key}`, group, name: manual.description, detail: 'escrito a mano', quantity: manual.quantity, price: manual.price, manual: true });
      }
    }

    const sectionGroups: Record<string, string> = { UNIFORM: 'Uniformes', NOTEBOOK: 'Cuadernos', OTHER: 'Otros' };
    for (const [id, quantity] of Object.entries(draft.cart)) {
      const product = index.get(Number(id));
      if (product && quantity > 0) {
        lines.push({
          key: `c${id}`,
          group: sectionGroups[product.section] ?? 'Otros',
          name: product.garment ? `${product.garment} · talla ${product.size}` : product.name,
          detail: product.code,
          quantity,
          price: product.price,
          manual: false,
          cartProductId: product.productId,
        });
      }
    }
    return lines;
  });

  protected readonly summaryGroups = computed(() => {
    const groups = new Map<string, SummaryLine[]>();
    for (const line of this.lines()) {
      groups.set(line.group, [...(groups.get(line.group) ?? []), line]);
    }
    return [...groups.entries()].map(([name, lines]) => ({ name, lines, subtotal: lines.reduce((s, l) => s + l.price * l.quantity, 0) }));
  });

  protected readonly total = computed(() => this.lines().reduce((sum, l) => sum + l.price * l.quantity, 0));
  protected readonly itemCount = computed(() => this.lines().reduce((sum, l) => sum + l.quantity, 0));
  protected readonly withoutPrice = computed(() => this.lines().filter((l) => l.price <= 0).length);

  /** Cantidad por paso, para las insignias de las pestañas. */
  protected readonly stepCounts = computed<Record<Step, number>>(() => {
    const counts: Record<Step, number> = { customer: 0, texts: 0, uniforms: 0, notebooks: 0, others: 0, summary: this.itemCount() };
    const index = this.index();
    for (const student of this.draft().students) {
      counts.texts += student.selected.length + student.extras.length + student.manual.reduce((s, m) => s + m.quantity, 0);
    }
    for (const [id, qty] of Object.entries(this.draft().cart)) {
      const section = index.get(Number(id))?.section;
      if (section === 'UNIFORM') counts.uniforms += qty;
      else if (section === 'NOTEBOOK') counts.notebooks += qty;
      else counts.others += qty;
    }
    return counts;
  });

  constructor() {
    // Cada "Nuevo pedido" empieza en blanco. Se borra también el borrador que guardaban las
    // versiones anteriores, para que no reaparezca un pedido viejo.
    try {
      sessionStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch {
      // sin almacenamiento
    }
    void this.load();
  }

  /** Hay un pedido a medio cargar (todavía no enviado). */
  private hasPendingOrder(): boolean {
    return !this.created() && (!!this.draft().customerName.trim() || this.lines().length > 0);
  }

  /** Lo llama la ruta al salir: si el pedido está a medias, pregunta antes de perderlo. */
  confirmLeave(): boolean | Observable<boolean> {
    if (!this.hasPendingOrder()) {
      return true;
    }
    return this.dialogService
      .open<boolean, ConfirmDialogData>(ConfirmDialog, {
        data: {
          title: '¿Salir sin enviar el pedido?',
          message: 'Lo que cargó en este pedido se va a perder.',
          confirmLabel: 'Salir',
          cancelLabel: 'Seguir con el pedido',
        },
      })
      .closed.pipe(map((confirmed) => !!confirmed));
  }

  protected async load(force = false): Promise<void> {
    this.loading.set(true);
    this.errorCode.set(null);
    try {
      this.form.set(await this.salesService.loadOrderForm(force));
      if (this.draft().students.length === 0) {
        this.addStudent();
      }
    } catch (error) {
      this.errorCode.set((error as { status?: number }).status || 500);
    } finally {
      this.loading.set(false);
    }
  }

  // ------------------------------------------------------------------ navegación

  /** Paso actual como número (0 = Datos … 5 = Resumen), para el indicador de avance. */
  protected readonly stepIndex = computed(() => this.steps.findIndex((s) => s.id === this.step()));
  /** Hasta qué paso llegó el promotor: se puede volver a cualquiera ya visitado, pero no saltar adelante. */
  protected readonly reached = signal(0);

  protected goTo(step: Step): void {
    const index = this.steps.findIndex((s) => s.id === step);
    if (index > this.reached()) {
      return;
    }
    this.step.set(step);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Avanza un paso. Desde "Datos" no se avanza sin el nombre para la factura. */
  protected next(): void {
    const i = this.stepIndex();
    if (this.step() === 'customer' && !this.customerValid()) {
      this.touchAll();
      this.toastService.warning('Revise los datos para la factura.');
      return;
    }
    if (i < this.steps.length - 1) {
      this.reached.update((r) => Math.max(r, i + 1));
      this.goTo(this.steps[i + 1].id);
    }
  }

  protected back(): void {
    const i = this.stepIndex();
    if (i > 0) {
      this.goTo(this.steps[i - 1].id);
    }
  }

  // ------------------------------------------------------------------ datos del papá

  protected updateDraft(patch: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...patch }));
  }

  // ------------------------------------------------------------------ hijos y textos

  protected addStudent(): void {
    this.draft.update((d) => ({
      ...d,
      students: [...d.students, { key: nextKey++, label: `Hijo ${d.students.length + 1}`, courseId: null, selected: [], extras: [], manual: [] }],
    }));
  }

  protected removeStudent(key: number): void {
    this.draft.update((d) => ({
      ...d,
      students: d.students.filter((s) => s.key !== key).map((s, i) => ({ ...s, label: `Hijo ${i + 1}` })),
    }));
  }

  protected course(courseId: number | null): FormCourse | undefined {
    return courseId ? this.courses().get(courseId) : undefined;
  }

  /** Al elegir el curso aparecen todos sus textos marcados (menos los opcionales, como la agenda). */
  protected setCourse(student: StudentDraft, courseId: number): void {
    const course = this.courses().get(courseId);
    this.patchStudent(student.key, {
      courseId,
      selected: (course?.items ?? []).filter((i) => i.isDefaultSelected).map((i) => i.productId),
    });
  }

  protected toggleText(student: StudentDraft, productId: number): void {
    const selected = student.selected.includes(productId)
      ? student.selected.filter((id) => id !== productId)
      : [...student.selected, productId];
    this.patchStudent(student.key, { selected });
  }

  protected setAllTexts(student: StudentDraft, all: boolean): void {
    const course = this.course(student.courseId);
    this.patchStudent(student.key, { selected: all ? (course?.items ?? []).map((i) => i.productId) : [] });
  }

  protected studentTotal(student: StudentDraft): number {
    const index = this.index();
    return (
      [...student.selected, ...student.extras].reduce((sum, id) => sum + (index.get(id)?.price ?? 0), 0) +
      student.manual.reduce((sum, m) => sum + m.price * m.quantity, 0)
    );
  }

  protected product(id: number): IndexedProduct | undefined {
    return this.index().get(id);
  }

  protected openExtraSearch(student: StudentDraft): void {
    this.manualFor.set(null);
    this.extraSearch.set('');
    this.extraSearchFor.set(this.extraSearchFor() === student.key ? null : student.key);
  }

  protected addExtra(student: StudentDraft, productId: number): void {
    const inList = this.course(student.courseId)?.items.some((i) => i.productId === productId);
    if (inList) {
      if (!student.selected.includes(productId)) {
        this.patchStudent(student.key, { selected: [...student.selected, productId] });
      }
    } else if (!student.extras.includes(productId)) {
      this.patchStudent(student.key, { extras: [...student.extras, productId] });
    }
    this.toastService.success('Texto agregado', this.product(productId)?.name);
    this.extraSearch.set('');
  }

  protected removeExtra(student: StudentDraft, productId: number): void {
    this.patchStudent(student.key, { extras: student.extras.filter((id) => id !== productId) });
  }

  protected openManual(student: StudentDraft): void {
    this.extraSearchFor.set(null);
    this.manualName = '';
    this.manualPrice = null;
    this.manualFor.set(this.manualFor() === student.key ? null : student.key);
  }

  protected addManual(student: StudentDraft): void {
    const description = this.manualName.trim();
    const price = Number(this.manualPrice);
    const error = manualTextError(description, this.manualPrice);
    this.manualError.set(error);
    if (error) {
      return; // el error se muestra debajo de los campos
    }
    this.patchStudent(student.key, { manual: [...student.manual, { key: nextKey++, description, price: Math.round(price * 100) / 100, quantity: 1 }] });
    this.manualFor.set(null);
  }

  protected removeManual(student: StudentDraft, key: number): void {
    this.patchStudent(student.key, { manual: student.manual.filter((m) => m.key !== key) });
  }

  private patchStudent(key: number, patch: Partial<StudentDraft>): void {
    this.draft.update((d) => ({ ...d, students: d.students.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  }

  // ------------------------------------------------------------------ carrito (uniformes, cuadernos, otros)

  protected qty(productId: number): number {
    return this.draft().cart[productId] ?? 0;
  }

  protected changeQty(productId: number, delta: number): void {
    this.draft.update((d) => {
      const cart = { ...d.cart };
      const value = Math.max(0, Math.min(99, (cart[productId] ?? 0) + delta));
      if (value === 0) {
        delete cart[productId];
      } else {
        cart[productId] = value;
      }
      return { ...d, cart };
    });
  }

  protected garmentQty(garment: FormGarment): number {
    return garment.sizes.reduce((sum, s) => sum + this.qty(s.productId), 0);
  }

  protected garmentPriceRange(garment: FormGarment): string {
    const prices = garment.sizes.map((s) => s.price).filter((p) => p > 0);
    if (prices.length === 0) {
      return 'Sin precio';
    }
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `Bs ${this.money(min)}` : `Bs ${this.money(min)} – ${this.money(max)}`;
  }

  private filterProducts(products: FormProduct[], search: string): FormProduct[] {
    const term = search.trim().toLowerCase();
    return term ? products.filter((p) => p.name.toLowerCase().includes(term) || (p.code ?? '').includes(term)) : products;
  }

  // ------------------------------------------------------------------ finalizar

  protected async finish(): Promise<void> {
    const draft = this.draft();
    if (!this.customerValid()) {
      this.touchAll();
      this.goTo('customer');
      this.toastService.warning('Revise los datos para la factura.');
      return;
    }
    if (this.lines().length === 0) {
      this.toastService.warning('El pedido está vacío.');
      return;
    }

    const lines: OrderLineRequest[] = [];
    for (const student of draft.students) {
      for (const productId of [...student.selected, ...student.extras]) {
        lines.push({ productId, quantity: 1, courseId: student.courseId, studentLabel: student.label });
      }
      for (const manual of student.manual) {
        lines.push({ productId: null, description: manual.description, unitPrice: manual.price, quantity: manual.quantity, courseId: student.courseId, studentLabel: student.label });
      }
    }
    for (const [id, quantity] of Object.entries(draft.cart)) {
      lines.push({ productId: Number(id), quantity });
    }

    this.saving.set(true);
    try {
      const order = await this.salesService.createOrder({
        customerName: draft.customerName.trim(),
        taxId: draft.taxId.trim() || null,
        phone: draft.phone.trim() || null,
        schoolId: draft.schoolId,
        notes: draft.notes.trim() || null,
        lines,
      });
      this.created.set(order);
      // El pedido ya está en almacén: el borrador se descarta al instante (si el promotor sale de la
      // pantalla de la ficha y vuelve, empieza de cero). Los datos del papá se guardan aparte solo
      // para el botón "Agregar algo más para el mismo papá".
      this.lastCustomer = {
        customerName: draft.customerName,
        taxId: draft.taxId,
        phone: draft.phone,
        schoolId: draft.schoolId,
      };
      this.resetDraft();
    } catch (error) {
      this.toastService.error('No se pudo enviar el pedido', apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Pedido nuevo. Con keepCustomer, para el mismo papá (cuando quiere agregar algo más: nueva ficha). */
  protected startNew(keepCustomer: boolean): void {
    // Desde la pantalla de la ficha los datos del papá vienen de lastCustomer (el borrador ya se borró).
    const customer = keepCustomer ? (this.created() ? this.lastCustomer : this.draft()) : null;
    this.resetDraft();
    if (customer) {
      this.draft.update((d) => ({
        ...d,
        customerName: customer.customerName,
        taxId: customer.taxId,
        phone: customer.phone,
        schoolId: customer.schoolId,
      }));
    }
    this.created.set(null);
    this.reached.set(customer ? 1 : 0);
    this.goTo(customer ? 'texts' : 'customer');
  }

  /** Datos del papá del último pedido enviado (para "Agregar algo más para el mismo papá"). */
  private lastCustomer: Pick<Draft, 'customerName' | 'taxId' | 'phone' | 'schoolId'> | null = null;

  /** Deja el pedido en blanco, con un hijo vacío. */
  private resetDraft(): void {
    this.draft.set(emptyDraft());
    this.addStudent();
    this.touched.set(new Set());
    this.manualError.set(null);
    this.reached.set(0);
  }

  protected clearOrder(): void {
    this.startNew(false);
    this.toastService.info('Pedido limpiado.');
  }
}
