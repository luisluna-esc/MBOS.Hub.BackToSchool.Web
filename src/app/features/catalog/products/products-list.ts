import { Icon } from '../../../shared/components/icon/icon';
import { Component, computed, inject, signal } from '@angular/core';
import { FIELD_RULES, nameError, priceError } from '../../../core/forms/field-rules';
import { AllowedCharsDirective } from '../../../shared/directives/allowed-chars.directive';
import { NumberOnlyDirective } from '../../../shared/directives/number-only.directive';
import { FormsModule } from '@angular/forms';
import { DialogService } from '../../../core/dialog/dialog.service';
import { formatMoney } from '../../../core/format/money';
import { Product, ProductSection, SECTION_LABELS } from '../../../core/sales/sales.models';
import { SalesService, apiError } from '../../../core/sales/sales.service';
import { ToastService } from '../../../core/toast/toast.service';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { ProductFormDialog, ProductFormDialogData } from './product-form-dialog';

const PAGE_SIZE = 50;

/** Catálogo y precios. Los precios se escriben en la misma lista y se guardan todos juntos. */
@Component({
  selector: 'app-products-list',
  imports: [FormsModule, ErrorState, Icon, AllowedCharsDirective, NumberOnlyDirective],
  templateUrl: './products-list.html',
})
export class ProductsList {
  private readonly salesService = inject(SalesService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(DialogService);

  protected readonly money = formatMoney;
  protected readonly sectionLabels = SECTION_LABELS;
  protected readonly rules = FIELD_RULES;
  protected readonly sections: (ProductSection | null)[] = [null, 'TEXT', 'NOTEBOOK', 'UNIFORM', 'OTHER'];

  protected readonly rows = signal<Product[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly pageNumber = signal(1);
  protected readonly loading = signal(true);
  protected readonly errorCode = signal<number | null>(null);
  protected readonly saving = signal(false);

  protected readonly search = signal('');
  protected readonly section = signal<ProductSection | null>(null);
  protected readonly withoutPrice = signal(false);
  protected readonly showInactive = signal(false);

  /** Precios escritos y todavía no guardados: productId → precio. */
  protected readonly edited = signal<Record<number, number>>({});
  protected readonly editedCount = computed(() => Object.keys(this.edited()).length);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.totalRecords() / PAGE_SIZE)));

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.salesService.products(this.pageNumber(), PAGE_SIZE, {
        searchCriteria: this.search().trim() || undefined,
        section: this.section() ?? undefined,
        withoutPrice: this.withoutPrice() || undefined,
        isActive: this.showInactive() ? undefined : true,
      });
      this.rows.set(result.items);
      this.totalRecords.set(result.totalRecords);
      this.errorCode.set(null);
    } catch (error) {
      this.errorCode.set((error as { status?: number }).status || 500);
    } finally {
      this.loading.set(false);
    }
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 350);
  }

  protected reload(): void {
    this.pageNumber.set(1);
    void this.load();
  }

  protected goToPage(page: number): void {
    if (this.editedCount() && !confirm('Hay precios sin guardar en esta página. ¿Cambiar de página igual?')) {
      return;
    }
    this.edited.set({});
    this.pageNumber.set(page);
    void this.load();
  }

  protected priceOf(row: Product): number {
    return this.edited()[row.productId] ?? row.price;
  }

  protected setPrice(row: Product, value: number | string | null): void {
    const price = Number(value);
    this.edited.update((current) => {
      const next = { ...current };
      if (value === null || value === '' || priceError(price) !== null || price === row.price) {
        delete next[row.productId];
      } else {
        next[row.productId] = Math.max(0, price);
      }
      return next;
    });
  }

  protected async savePrices(): Promise<void> {
    const prices = Object.entries(this.edited()).map(([productId, price]) => ({ productId: Number(productId), price }));
    if (!prices.length) return;
    this.saving.set(true);
    try {
      await this.salesService.savePrices(prices);
      this.toastService.success(`${prices.length} precio(s) guardado(s)`);
      this.edited.set({});
      this.salesService.orderForm.set(null); // el promotor verá los precios nuevos
      await this.load();
    } catch (error) {
      this.toastService.error('No se pudieron guardar los precios', apiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected openForm(product: Product | null): void {
    const ref = this.dialogService.open<boolean, ProductFormDialogData>(ProductFormDialog, { data: { product } });
    ref.closed.subscribe((saved) => {
      if (saved) {
        this.salesService.orderForm.set(null);
        void this.load();
      }
    });
  }
}
