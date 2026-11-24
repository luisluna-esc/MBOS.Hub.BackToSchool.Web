import { AuthService } from '../auth/auth.service';
import { SalesService } from './sales.service';

/** Roles que manejan la cola de almacén (deben coincidir con SaleOrderService.WarehouseRoles en la API). */
export const WAREHOUSE_ROLES = ['M-BOS', 'Administrador', 'Almacén'];

export function isWarehouseRole(auth: AuthService): boolean {
  return WAREHOUSE_ROLES.includes(auth.activeRole() ?? '');
}

/**
 * Abre la hoja PDF del pedido en otra pestaña para imprimirla. La pestaña se abre antes de pedir
 * el PDF (en el mismo clic) para que el navegador no la bloquee como ventana emergente.
 */
export async function openOrderPdf(sales: SalesService, saleOrderId: number): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const blob = await sales.orderPdf(saleOrderId);
    const url = URL.createObjectURL(blob);
    if (tab) {
      tab.location.href = url;
    } else {
      window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
