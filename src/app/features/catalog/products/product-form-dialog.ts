import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FIELD_RULES, nameError, priceError } from '../../../core/forms/field-rules';
import { Product, ProductSection, SECTION_LABELS } from '../../../core/sales/sales.models';
import { SalesService, apiError } from '../../../core/sales/sales.service';
import { ToastService } from '../../../core/toast/toast.service';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { AllowedCharsDirective } from '../../../shared/directives/allowed-chars.directive';
import { NumberOnlyDirective } from '../../../shared/directives/number-only.directive';

export interface ProductFormDialogData {
  product: Product | null;
}

type Field = 'name' | 'code' | 'garmentName' | 'size' | 'price' | 'stock';

const INPUT = 'rounded-md border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent';

@Component({
  selector: 'app-product-form-dialog',
  imports: [Dialog, FormsModule, AllowedCharsDirective, NumberOnlyDirective],
  template: `
    <app-dialog
      [title]="form().productId ? 'Editar producto' : 'Nuevo producto'"
      saveLabel="Guardar"
      [saveDisabled]="saving()"
      (save)="save()"
      (cancel)="close(false)"
    >
      <div class="flex flex-col gap-3 text-sm">
        <div class="flex flex-wrap gap-2">
          @for (s of sections; track s) {
            <button type="button" class="rounded-full border px-3 py-1.5"
              [class]="form().section === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground'"
              (click)="set('section', s)">{{ labels[s] }}</button>
          }
        </div>

        <label class="flex flex-col gap-1"><span class="text-muted-foreground">Nombre</span>
          <input [class]="inputClass('name')" appAllowed="name" [maxlength]="rules.productName.max"
            [ngModel]="form().name" (ngModelChange)="set('name', $event)" (blur)="touch('name')" />
          @if (error('name'); as e) { <span class="text-xs text-danger">{{ e }}</span> }
        </label>

        <label class="flex flex-col gap-1"><span class="text-muted-foreground">Código (opcional, solo números)</span>
          <input [class]="inputClass('code')" inputmode="numeric" appAllowed="digits" [maxlength]="rules.productCode.max"
            [ngModel]="form().code" (ngModelChange)="set('code', $event)" (blur)="touch('code')" />
        </label>

        @if (form().section === 'UNIFORM') {
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1"><span class="text-muted-foreground">Prenda</span>
              <input [class]="inputClass('garmentName')" placeholder="BLUSA" appAllowed="letters" [maxlength]="rules.garment.max"
                [ngModel]="form().garmentName" (ngModelChange)="set('garmentName', $event)" (blur)="touch('garmentName')" />
              @if (error('garmentName'); as e) { <span class="text-xs text-danger">{{ e }}</span> }
            </label>
            <label class="flex flex-col gap-1"><span class="text-muted-foreground">Talla</span>
              <input [class]="inputClass('size')" placeholder="M" appAllowed="name" [maxlength]="rules.size.max"
                [ngModel]="form().size" (ngModelChange)="set('size', $event)" (blur)="touch('size')" />
            </label>
          </div>
          <p class="text-xs text-muted-foreground">Cada talla es un producto: las tallas con la misma prenda se agrupan en la pantalla del promotor.</p>
        }

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1"><span class="text-muted-foreground">Precio (Bs)</span>
            <input type="number" min="0" [max]="rules.price.max" step="0.5" inputmode="decimal" [class]="inputClass('price')"
              [ngModel]="form().price" (ngModelChange)="set('price', $event)" (blur)="touch('price')" />
            @if (error('price'); as e) { <span class="text-xs text-danger">{{ e }}</span> }
          </label>
          <label class="flex flex-col gap-1"><span class="text-muted-foreground">Stock</span>
            <input type="number" min="0" step="1" inputmode="numeric" [class]="inputClass('stock')"
              [ngModel]="form().stock" (ngModelChange)="set('stock', $event)" (blur)="touch('stock')" />
            @if (error('stock'); as e) { <span class="text-xs text-danger">{{ e }}</span> }
          </label>
        </div>
        <label class="flex items-center gap-2 text-foreground">
          <input type="checkbox" [ngModel]="form().isActive" (ngModelChange)="set('isActive', $event)" /> Activo (aparece en la pantalla del promotor)
        </label>
      </div>
    </app-dialog>
  `,
})
export class ProductFormDialog {
  private readonly data = inject<ProductFormDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean, ProductFormDialog>);
  private readonly salesService = inject(SalesService);
  private readonly toastService = inject(ToastService);

  protected readonly sections: ProductSection[] = ['TEXT', 'NOTEBOOK', 'UNIFORM', 'OTHER'];
  protected readonly labels = SECTION_LABELS;
  protected readonly rules = FIELD_RULES;
  protected readonly saving = signal(false);
  protected readonly form = signal<Partial<Product>>(
    this.data.product
      ? { ...this.data.product }
      : { section: 'TEXT', name: '', code: '', garmentName: '', size: '', price: 0, stock: 0, sizeOrder: 0, isActive: true }
  );
  private readonly touched = signal<ReadonlySet<Field>>(new Set());

  private readonly errors = computed<Record<Field, string | null>>(() => {
    const f = this.form();
    const stock = Number(f.stock);
    return {
      name: nameError(f.name ?? '', FIELD_RULES.productName),
      code: null,
      garmentName: f.section === 'UNIFORM' ? nameError(f.garmentName ?? '', FIELD_RULES.garment) : null,
      size: null,
      price: priceError(f.price ?? null, true),
      stock: Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock) ? 'El stock debe ser un número entero, 0 o más.' : null,
    };
  });

  protected set<K extends keyof Product>(field: K, value: Product[K]): void {
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  protected touch(field: Field): void {
    this.touched.update((t) => new Set([...t, field]));
  }

  protected error(field: Field): string | null {
    return this.touched().has(field) ? this.errors()[field] : null;
  }

  protected inputClass(field: Field): string {
    return `${INPUT} ${this.error(field) ? 'border-danger' : 'border-border'}`;
  }

  protected async save(): Promise<void> {
    if (Object.values(this.errors()).some((e) => e)) {
      this.touched.set(new Set(['name', 'code', 'garmentName', 'size', 'price', 'stock']));
      return;
    }
    this.saving.set(true);
    try {
      const f = this.form();
      await this.salesService.saveProduct({
        ...f,
        name: f.name?.trim(),
        code: f.code?.trim() || null,
        garmentName: f.garmentName?.trim() || null,
        size: f.size?.trim() || null,
        price: Math.round(Number(f.price) * 100) / 100,
        stock: Number(f.stock),
      });
      this.toastService.success('Producto guardado');
      this.close(true);
    } catch (error) {
      this.toastService.error('No se pudo guardar', apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(saved: boolean): void {
    this.dialogRef.close(saved);
  }
}
