import { Icon } from '../../../shared/components/icon/icon';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FIELD_RULES } from '../../../core/forms/field-rules';
import { AllowedCharsDirective } from '../../../shared/directives/allowed-chars.directive';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { DialogService } from '../../../core/dialog/dialog.service';
import { formatMoney } from '../../../core/format/money';
import { isWarehouseRole } from '../../../core/sales/order-actions';
import { Order, OrderStatus, STATUS_CLASSES, STATUS_LABELS } from '../../../core/sales/sales.models';
import { SalesService } from '../../../core/sales/sales.service';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { OrderDetailDialog, OrderDetailDialogData } from '../order-detail-dialog/order-detail-dialog';

const REFRESH_MS = 15_000;

/** Pedidos del día. El promotor ve los suyos; caja y almacén, todos (para buscar por número de ficha). */
@Component({
  selector: 'app-orders-list',
  imports: [FormsModule, DatePipe, RouterLink, ErrorState, Icon, AllowedCharsDirective],
  templateUrl: './orders-list.html',
})
export class OrdersList {
  private readonly salesService = inject(SalesService);
  private readonly dialogService = inject(DialogService);
  private readonly authService = inject(AuthService);

  protected readonly money = formatMoney;
  protected readonly rules = FIELD_RULES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusClasses = STATUS_CLASSES;
  protected readonly statuses: (OrderStatus | null)[] = [null, 'PENDING', 'PRINTED', 'READY', 'CANCELLED'];

  protected readonly orders = signal<Order[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorCode = signal<number | null>(null);
  protected readonly date = signal(this.today());
  protected readonly status = signal<OrderStatus | null>(null);
  protected readonly ticket = signal('');

  protected readonly seesAll = isWarehouseRole(this.authService) || this.authService.activeRole() === 'Caja';
  protected readonly isPromoter = ['Promotor', 'M-BOS', 'Administrador'].includes(this.authService.activeRole() ?? '');

  protected readonly visible = computed(() => {
    const ticket = this.ticket().trim();
    const search = ticket.toLowerCase();
    return this.orders().filter(
      (o) =>
        (!this.status() || o.status === this.status()) &&
        (!ticket || String(o.ticketNumber) === ticket || o.customerName.toLowerCase().includes(search))
    );
  });

  protected readonly totals = computed(() => {
    const active = this.orders().filter((o) => o.status !== 'CANCELLED');
    return { count: active.length, total: active.reduce((s, o) => s + o.total, 0) };
  });

  constructor() {
    void this.load();
    const timer = setInterval(() => void this.load(true), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async load(silent = false): Promise<void> {
    if (!silent) this.loading.set(true);
    try {
      this.orders.set(await this.salesService.listOrders({ ticketDate: this.date(), mine: !this.seesAll }));
      this.errorCode.set(null);
    } catch (error) {
      if (!silent) this.errorCode.set((error as { status?: number }).status || 500);
    } finally {
      this.loading.set(false);
    }
  }

  protected changeDate(value: string): void {
    this.date.set(value || this.today());
    void this.load();
  }

  protected open(order: Order): void {
    const ref = this.dialogService.open<boolean, OrderDetailDialogData>(OrderDetailDialog, {
      data: { saleOrderId: order.saleOrderId },
    });
    ref.closed.subscribe((changed) => changed && void this.load(true));
  }

  private today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}
