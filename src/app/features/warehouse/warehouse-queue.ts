import { Icon } from '../../shared/components/icon/icon';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DialogService } from '../../core/dialog/dialog.service';
import { formatMoney } from '../../core/format/money';
import { openOrderPdf } from '../../core/sales/order-actions';
import { Order, OrderStatus } from '../../core/sales/sales.models';
import { SalesService, apiError } from '../../core/sales/sales.service';
import { ToastService } from '../../core/toast/toast.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { OrderDetailDialog, OrderDetailDialogData } from '../orders/order-detail-dialog/order-detail-dialog';

const REFRESH_MS = 5_000;
const SOUND_KEY = 'warehouseSound';

interface Column {
  status: OrderStatus;
  title: string;
  hint: string;
  accent: string;
}

/**
 * Pantalla de almacén (PC): los pedidos llegan solos, se imprime la hoja, se sacan los
 * materiales y se marcan "Listo en caja" cuando se llevan a caja.
 */
@Component({
  selector: 'app-warehouse-queue',
  imports: [DatePipe, ErrorState, Icon],
  templateUrl: './warehouse-queue.html',
})
export class WarehouseQueue {
  private readonly salesService = inject(SalesService);
  private readonly dialogService = inject(DialogService);
  private readonly toastService = inject(ToastService);

  protected readonly money = formatMoney;
  protected readonly columns: Column[] = [
    { status: 'PENDING', title: 'Nuevos', hint: 'Imprimir la hoja', accent: 'border-t-warning' },
    { status: 'PRINTED', title: 'En almacén', hint: 'Sacando materiales', accent: 'border-t-info' },
    { status: 'READY', title: 'Listos en caja', hint: 'Esperando al papá', accent: 'border-t-success' },
  ];

  protected readonly orders = signal<Order[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorCode = signal<number | null>(null);
  protected readonly lastUpdate = signal<Date | null>(null);
  protected readonly sound = signal(this.readSound());
  /** Fichas que llegaron desde que se abrió la pantalla: se resaltan un momento. */
  protected readonly fresh = signal<ReadonlySet<number>>(new Set());
  protected readonly busyId = signal<number | null>(null);

  private knownIds: Set<number> | null = null;
  private audio: AudioContext | null = null;

  protected readonly byStatus = computed(() => {
    const map: Record<string, Order[]> = { PENDING: [], PRINTED: [], READY: [] };
    for (const order of this.orders()) {
      map[order.status]?.push(order);
    }
    // Nuevos y en almacén: el más antiguo primero (orden de atención). Listos: el último arriba.
    map['PENDING'].sort((a, b) => a.ticketNumber - b.ticketNumber);
    map['PRINTED'].sort((a, b) => a.ticketNumber - b.ticketNumber);
    map['READY'].sort((a, b) => b.ticketNumber - a.ticketNumber);
    return map;
  });

  constructor() {
    void this.load();
    const timer = setInterval(() => void this.load(true), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.title = 'BackToSchool';
      void this.audio?.close();
    });
  }

  protected async load(silent = false): Promise<void> {
    if (!silent) this.loading.set(true);
    try {
      const orders = await this.salesService.listOrders();
      this.detectNew(orders);
      this.orders.set(orders);
      this.lastUpdate.set(new Date());
      this.errorCode.set(null);
      const pending = orders.filter((o) => o.status === 'PENDING').length;
      document.title = pending ? `(${pending}) Almacén · BackToSchool` : 'Almacén · BackToSchool';
    } catch (error) {
      if (!silent) this.errorCode.set((error as { status?: number }).status || 500);
    } finally {
      this.loading.set(false);
    }
  }

  private detectNew(orders: Order[]): void {
    const ids = new Set(orders.map((o) => o.saleOrderId));
    if (this.knownIds) {
      const arrived = orders.filter((o) => !this.knownIds!.has(o.saleOrderId) && o.status === 'PENDING');
      if (arrived.length) {
        this.fresh.update((current) => new Set([...current, ...arrived.map((o) => o.saleOrderId)]));
        this.toastService.info(
          arrived.length === 1 ? `Nuevo pedido: ficha ${arrived[0].ticketNumber}` : `${arrived.length} pedidos nuevos`,
          arrived.map((o) => o.customerName).join(', ')
        );
        this.beep();
      }
    }
    this.knownIds = ids;
  }

  protected async print(order: Order, event?: Event): Promise<void> {
    event?.stopPropagation();
    this.busyId.set(order.saleOrderId);
    try {
      await openOrderPdf(this.salesService, order.saleOrderId);
      this.unmarkFresh(order.saleOrderId);
      await this.load(true);
    } catch (error) {
      this.toastService.error('No se pudo generar la hoja', apiError(error));
    } finally {
      this.busyId.set(null);
    }
  }

  protected async ready(order: Order, event?: Event): Promise<void> {
    event?.stopPropagation();
    this.busyId.set(order.saleOrderId);
    try {
      await this.salesService.changeStatus(order.saleOrderId, 'READY');
      this.toastService.success(`Ficha ${order.ticketNumber} lista en caja`);
      this.unmarkFresh(order.saleOrderId);
      await this.load(true);
    } catch (error) {
      this.toastService.error('No se pudo actualizar', apiError(error));
    } finally {
      this.busyId.set(null);
    }
  }

  protected open(order: Order): void {
    this.unmarkFresh(order.saleOrderId);
    const ref = this.dialogService.open<boolean, OrderDetailDialogData>(OrderDetailDialog, {
      data: { saleOrderId: order.saleOrderId },
    });
    ref.closed.subscribe(() => void this.load(true));
  }

  protected toggleSound(): void {
    this.sound.update((v) => !v);
    try {
      localStorage.setItem(SOUND_KEY, String(this.sound()));
    } catch {
      // sin almacenamiento
    }
    if (this.sound()) this.beep();
  }

  private unmarkFresh(id: number): void {
    this.fresh.update((current) => new Set([...current].filter((x) => x !== id)));
  }

  /** Dos tonos cortos. El navegador solo deja sonar después de que el usuario tocó la pantalla una vez. */
  private beep(): void {
    if (!this.sound()) return;
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      [0, 0.18].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = i === 0 ? 880 : 1175;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.17);
      });
    } catch {
      // sin audio: queda el aviso visual
    }
  }

  private readSound(): boolean {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'false';
    } catch {
      return true;
    }
  }
}
