import { Icon } from '../../../shared/components/icon/icon';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AllowedCharsDirective } from '../../../shared/directives/allowed-chars.directive';
import { AuthService } from '../../../core/auth/auth.service';
import { formatMoney } from '../../../core/format/money';
import { isWarehouseRole, openOrderPdf } from '../../../core/sales/order-actions';
import { Order, OrderLine, OrderStatus, STATUS_CLASSES, STATUS_LABELS } from '../../../core/sales/sales.models';
import { SalesService, apiError } from '../../../core/sales/sales.service';
import { ToastService } from '../../../core/toast/toast.service';
import { Dialog } from '../../../shared/components/dialog/dialog';

export interface OrderDetailDialogData {
  saleOrderId: number;
}

const SECTION_TITLES: Record<string, string> = { NOTEBOOK: 'Cuadernos', UNIFORM: 'Uniformes', OTHER: 'Otros materiales' };

/** Detalle de un pedido con sus acciones (imprimir, listo en caja, anular). Devuelve true si cambió algo. */
@Component({
  selector: 'app-order-detail-dialog',
  imports: [Dialog, DatePipe, FormsModule, Icon, AllowedCharsDirective],
  templateUrl: './order-detail-dialog.html',
})
export class OrderDetailDialog {
  private readonly data = inject<OrderDetailDialogData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<boolean, OrderDetailDialog>);
  private readonly salesService = inject(SalesService);
  private readonly toastService = inject(ToastService);
  private readonly authService = inject(AuthService);

  protected readonly money = formatMoney;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusClasses = STATUS_CLASSES;

  protected readonly order = signal<Order | null>(null);
  protected readonly busy = signal(false);
  protected readonly cancelling = signal(false);
  protected cancelReason = '';
  private changed = false;

  protected readonly warehouse = isWarehouseRole(this.authService);
  protected readonly canCancel = computed(() => {
    const order = this.order();
    if (!order || order.status === 'CANCELLED') return false;
    return this.warehouse || (order.status === 'PENDING' && order.promoterAppUserId === this.authService.session()?.appUserId);
  });

  /** Líneas agrupadas como en la hoja de almacén: textos por curso/hijo, luego cuadernos, uniformes y otros. */
  protected readonly groups = computed(() => {
    const groups = new Map<string, OrderLine[]>();
    for (const line of this.order()?.lines ?? []) {
      const title =
        line.section === 'TEXT'
          ? `Textos${line.courseName ? ' · ' + line.courseName : ''}${line.studentLabel ? ' (' + line.studentLabel + ')' : ''}`
          : SECTION_TITLES[line.section] ?? 'Otros';
      groups.set(title, [...(groups.get(title) ?? []), line]);
    }
    return [...groups.entries()].map(([title, lines]) => ({ title, lines }));
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.order.set(await this.salesService.getOrder(this.data.saleOrderId));
    } catch (error) {
      this.toastService.error('No se pudo abrir el pedido', apiError(error));
      this.dialogRef.close(false);
    }
  }

  protected async print(): Promise<void> {
    const order = this.order();
    if (!order) return;
    try {
      await openOrderPdf(this.salesService, order.saleOrderId);
      this.changed = true;
      await this.load();
    } catch (error) {
      this.toastService.error('No se pudo generar la hoja', apiError(error));
    }
  }

  protected async setStatus(status: OrderStatus): Promise<void> {
    const order = this.order();
    if (!order) return;
    if (status === 'CANCELLED' && this.cancelReason.trim().length < 5) {
      this.toastService.warning('Escriba el motivo de la anulación (mínimo 5 caracteres).');
      return;
    }
    this.busy.set(true);
    try {
      await this.salesService.changeStatus(order.saleOrderId, status, status === 'CANCELLED' ? this.cancelReason : undefined);
      this.toastService.success(`Ficha ${order.ticketNumber}: ${STATUS_LABELS[status]}`);
      this.changed = true;
      this.cancelling.set(false);
      await this.load();
    } catch (error) {
      this.toastService.error('No se pudo actualizar', apiError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.dialogRef.close(this.changed);
  }
}
