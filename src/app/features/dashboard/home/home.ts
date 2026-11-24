import { Icon } from '../../../shared/components/icon/icon';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { formatMoney } from '../../../core/format/money';
import { isWarehouseRole } from '../../../core/sales/order-actions';
import { SalesSummary } from '../../../core/sales/sales.models';
import { SalesService } from '../../../core/sales/sales.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Icon],
  template: `
    <div class="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <p class="text-sm text-muted-foreground">Hola,</p>
        <h1 class="text-2xl font-semibold text-foreground">{{ name() }}</h1>
        <p class="text-sm text-muted-foreground">{{ role() }}</p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        @if (canSell()) {
          <a routerLink="/orders/new" class="flex items-center gap-4 rounded-xl bg-primary p-5 text-primary-foreground shadow-lg">
            <app-icon name="cart-plus" size="size-10" />
            <span><span class="block text-lg font-semibold">Nuevo pedido</span><span class="text-sm opacity-80">Textos, uniformes y materiales</span></span>
          </a>
        }
        @if (warehouse) {
          <a routerLink="/warehouse" class="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
            <span class="text-accent"><app-icon name="box" size="size-9" /></span>
            <span><span class="block text-lg font-semibold text-foreground">Almacén</span><span class="text-sm text-muted-foreground">{{ summary()?.pending ?? 0 }} pedidos por imprimir</span></span>
          </a>
        }
        <a routerLink="/orders" class="flex items-center gap-4 rounded-xl border border-border bg-surface p-5">
          <span class="text-accent"><app-icon name="clipboard-list" size="size-9" /></span>
          <span><span class="block text-lg font-semibold text-foreground">{{ canSell() && !warehouse ? 'Mis pedidos' : 'Pedidos del día' }}</span><span class="text-sm text-muted-foreground">Buscar por número de ficha</span></span>
        </a>
      </div>

      @if (summary(); as s) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          @for (card of cards(); track card.label) {
            <div class="rounded-lg border border-border bg-surface p-4">
              <p class="text-xs text-muted-foreground">{{ card.label }}</p>
              <p class="text-2xl font-semibold text-foreground">{{ card.value }}</p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class Home {
  private readonly authService = inject(AuthService);
  private readonly salesService = inject(SalesService);

  protected readonly name = computed(() => this.authService.session()?.fullName || this.authService.session()?.username || '');
  protected readonly role = computed(() => this.authService.activeRole() ?? '');
  protected readonly warehouse = isWarehouseRole(this.authService);
  protected readonly canSell = computed(() => ['Promotor', 'M-BOS', 'Administrador'].includes(this.role()));
  protected readonly summary = signal<SalesSummary | null>(null);

  protected readonly cards = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return [
      { label: 'Pedidos de hoy', value: String(s.orders - s.cancelled) },
      { label: 'Por imprimir', value: String(s.pending) },
      { label: 'Listos en caja', value: String(s.ready) },
      { label: 'Total del día', value: 'Bs ' + formatMoney(s.total) },
    ];
  });

  constructor() {
    if (this.warehouse || this.role() === 'Caja') {
      this.salesService.summary().then((s) => this.summary.set(s)).catch(() => undefined);
    }
  }
}
