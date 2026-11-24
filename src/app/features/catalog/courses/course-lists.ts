import { Icon } from '../../../shared/components/icon/icon';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FIELD_RULES } from '../../../core/forms/field-rules';
import { AllowedCharsDirective } from '../../../shared/directives/allowed-chars.directive';
import { formatMoney } from '../../../core/format/money';
import { Course, CourseProduct, FormProduct } from '../../../core/sales/sales.models';
import { SalesService, apiError } from '../../../core/sales/sales.service';
import { ToastService } from '../../../core/toast/toast.service';
import { ErrorState } from '../../../shared/components/error-state/error-state';

/**
 * Lista de textos de cada curso: lo que aparece (marcado) cuando el promotor elige el curso.
 * "Opcional" = aparece desmarcado (ej. la agenda).
 */
@Component({
  selector: 'app-course-lists',
  imports: [FormsModule, ErrorState, Icon, AllowedCharsDirective],
  templateUrl: './course-lists.html',
})
export class CourseLists {
  private readonly salesService = inject(SalesService);
  private readonly toastService = inject(ToastService);

  protected readonly money = formatMoney;
  protected readonly rules = FIELD_RULES;
  protected readonly courses = signal<Course[]>([]);
  protected readonly selected = signal<Course | null>(null);
  protected readonly items = signal<CourseProduct[]>([]);
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorCode = signal<number | null>(null);

  protected readonly catalog = signal<FormProduct[]>([]);
  protected readonly search = signal('');
  protected readonly results = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (term.length < 2) return [];
    const inList = new Set(this.items().map((i) => i.productId));
    return this.catalog()
      .filter((p) => !inList.has(p.productId) && (p.name.toLowerCase().includes(term) || (p.code ?? '').includes(term)))
      .slice(0, 20);
  });

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    try {
      const [courses, form] = await Promise.all([this.salesService.courses(), this.salesService.loadOrderForm(true)]);
      this.courses.set(courses);
      // Textos y "otros" (la agenda está en otros).
      this.catalog.set([...form.texts, ...form.others]);
      if (courses.length) await this.select(courses[0]);
    } catch (error) {
      this.errorCode.set((error as { status?: number }).status || 500);
    }
  }

  protected async select(course: Course): Promise<void> {
    if (this.dirty() && !confirm('Hay cambios sin guardar en este curso. ¿Descartarlos?')) return;
    this.selected.set(course);
    this.items.set(await this.salesService.courseProducts(course.courseId));
    this.dirty.set(false);
    this.search.set('');
  }

  protected move(index: number, delta: number): void {
    const items = [...this.items()];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.items.set(items);
    this.dirty.set(true);
  }

  protected toggleDefault(item: CourseProduct): void {
    this.items.update((items) => items.map((i) => (i === item ? { ...i, isDefaultSelected: !i.isDefaultSelected } : i)));
    this.dirty.set(true);
  }

  protected remove(item: CourseProduct): void {
    this.items.update((items) => items.filter((i) => i !== item));
    this.dirty.set(true);
  }

  protected add(product: FormProduct): void {
    this.items.update((items) => [...items, { ...product, isDefaultSelected: true }]);
    this.dirty.set(true);
    this.search.set('');
  }

  protected async save(): Promise<void> {
    const course = this.selected();
    if (!course) return;
    this.saving.set(true);
    try {
      await this.salesService.saveCourseProducts(
        course.courseId,
        this.items().map((i) => ({ productId: i.productId, isDefaultSelected: i.isDefaultSelected }))
      );
      this.dirty.set(false);
      this.salesService.orderForm.set(null);
      this.courses.update((list) => list.map((c) => (c.courseId === course.courseId ? { ...c, itemCount: this.items().length } : c)));
      this.toastService.success(`Lista de ${course.name} guardada`);
    } catch (error) {
      this.toastService.error('No se pudo guardar', apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
