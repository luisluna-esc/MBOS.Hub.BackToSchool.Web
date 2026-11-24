import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiMessage } from '../auth/auth.models';
import { PagedResult } from '../http/paged-result';
import {
  Course,
  CourseProduct,
  Order,
  OrderForm,
  OrderRequest,
  OrderStatus,
  Product,
  SalesSummary,
  School,
} from './sales.models';

interface WriteResponse {
  id: number;
  messages: ApiMessage[];
}

const api = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient);

  /** El catálogo del promotor se baja una vez y se reutiliza entre pedidos (son ~600 productos). */
  readonly orderForm = signal<OrderForm | null>(null);

  async loadOrderForm(force = false): Promise<OrderForm> {
    const cached = this.orderForm();
    if (cached && !force) {
      return cached;
    }
    const response = await firstValueFrom(this.http.get<{ data: OrderForm }>(`${api}/Catalog/order-form`));
    this.orderForm.set(response.data);
    return response.data;
  }

  // ---------- pedidos

  async createOrder(request: OrderRequest): Promise<Order> {
    const response = await firstValueFrom(this.http.post<{ data: Order }>(`${api}/SaleOrders`, request));
    return response.data;
  }

  async listOrders(filters: { ticketDate?: string; status?: OrderStatus; ticketNumber?: number; mine?: boolean } = {}): Promise<Order[]> {
    const params: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params[key] = value;
      }
    }
    const response = await firstValueFrom(this.http.get<{ data: Order[] }>(`${api}/SaleOrders`, { params }));
    return response.data;
  }

  async getOrder(id: number): Promise<Order> {
    const response = await firstValueFrom(this.http.get<{ data: Order }>(`${api}/SaleOrders/${id}`));
    return response.data;
  }

  async summary(ticketDate?: string): Promise<SalesSummary> {
    const params: Record<string, string> = ticketDate ? { ticketDate } : {};
    const response = await firstValueFrom(this.http.get<{ data: SalesSummary }>(`${api}/SaleOrders/summary`, { params }));
    return response.data;
  }

  changeStatus(id: number, status: OrderStatus, reason?: string): Promise<WriteResponse> {
    return firstValueFrom(this.http.put<WriteResponse>(`${api}/SaleOrders/${id}/status`, { status, reason: reason ?? null }));
  }

  /** PDF de la hoja de almacén (al pedirlo, el pedido pasa a "En almacén"). */
  orderPdf(id: number): Promise<Blob> {
    return firstValueFrom(this.http.get(`${api}/SaleOrders/${id}/pdf`, { responseType: 'blob' }));
  }

  // ---------- catálogo (administración)

  async schools(includeInactive = true): Promise<School[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: School[] }>(`${api}/Catalog/schools`, { params: { includeInactive } })
    );
    return response.data;
  }

  saveSchool(school: Partial<School>): Promise<WriteResponse> {
    return school.schoolId
      ? firstValueFrom(this.http.put<WriteResponse>(`${api}/Catalog/schools/${school.schoolId}`, school))
      : firstValueFrom(this.http.post<WriteResponse>(`${api}/Catalog/schools`, school));
  }

  async courses(): Promise<Course[]> {
    const response = await firstValueFrom(this.http.get<{ data: Course[] }>(`${api}/Catalog/courses`));
    return response.data;
  }

  async courseProducts(courseId: number): Promise<CourseProduct[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: CourseProduct[] }>(`${api}/Catalog/courses/${courseId}/products`)
    );
    return response.data;
  }

  saveCourseProducts(courseId: number, items: { productId: number; isDefaultSelected: boolean }[]): Promise<WriteResponse> {
    return firstValueFrom(this.http.put<WriteResponse>(`${api}/Catalog/courses/${courseId}/products`, { items }));
  }

  async products(
    pageNumber: number,
    pageSize: number,
    filters: { searchCriteria?: string; section?: string; withoutPrice?: boolean; isActive?: boolean }
  ): Promise<PagedResult<Product>> {
    const params: Record<string, string | number | boolean> = { pageNumber, pageSize };
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params[key] = value;
      }
    }
    const response = await firstValueFrom(
      this.http.get<{ data: PagedResult<Product> }>(`${api}/Catalog/products`, { params })
    );
    return response.data;
  }

  saveProduct(product: Partial<Product>): Promise<WriteResponse> {
    return product.productId
      ? firstValueFrom(this.http.put<WriteResponse>(`${api}/Catalog/products/${product.productId}`, product))
      : firstValueFrom(this.http.post<WriteResponse>(`${api}/Catalog/products`, product));
  }

  savePrices(prices: { productId: number; price: number }[]): Promise<WriteResponse> {
    return firstValueFrom(this.http.put<WriteResponse>(`${api}/Catalog/products/prices`, prices));
  }
}

/** Primer mensaje de error que devolvió la API (o uno genérico). */
export function apiError(error: unknown, fallback = 'No se pudo completar la operación.'): string {
  const body = (error as { error?: { messages?: ApiMessage[] } })?.error;
  return body?.messages?.find((m) => m.description)?.description ?? fallback;
}
