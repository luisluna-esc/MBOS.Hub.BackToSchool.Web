export type ProductSection = 'TEXT' | 'NOTEBOOK' | 'UNIFORM' | 'OTHER';
export type OrderStatus = 'PENDING' | 'PRINTED' | 'READY' | 'CANCELLED';

// ---------- Pantalla del promotor ----------

export interface School {
  schoolId: number;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface FormProduct {
  productId: number;
  code: string | null;
  name: string;
  price: number;
  stock: number;
}

export interface FormCourseItem extends FormProduct {
  isDefaultSelected: boolean;
}

export interface FormCourse {
  courseId: number;
  name: string;
  level: string;
  items: FormCourseItem[];
}

export interface FormSize {
  productId: number;
  code: string | null;
  size: string;
  price: number;
  stock: number;
}

export interface FormGarment {
  garmentName: string;
  group: string;
  sizes: FormSize[];
}

export interface OrderForm {
  schools: School[];
  courses: FormCourse[];
  texts: FormProduct[];
  notebooks: FormProduct[];
  garments: FormGarment[];
  others: FormProduct[];
}

// ---------- Pedido ----------

export interface OrderLineRequest {
  productId: number | null;
  description?: string | null;
  unitPrice?: number | null;
  quantity: number;
  courseId?: number | null;
  studentLabel?: string | null;
}

export interface OrderRequest {
  customerName: string;
  taxId: string | null;
  phone: string | null;
  schoolId: number | null;
  notes: string | null;
  lines: OrderLineRequest[];
}

export interface OrderLine {
  saleOrderLineId: number;
  productId: number | null;
  code: string | null;
  description: string;
  size: string | null;
  section: ProductSection;
  courseId: number | null;
  courseName: string | null;
  studentLabel: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  isManual: boolean;
}

export interface Order extends Record<string, unknown> {
  saleOrderId: number;
  ticketNumber: number;
  ticketDate: string;
  customerName: string;
  taxId: string | null;
  phone: string | null;
  schoolId: number | null;
  schoolName: string | null;
  promoterAppUserId: number;
  promoterName: string | null;
  status: OrderStatus;
  total: number;
  itemCount: number;
  notes: string | null;
  createdAt: string;
  printedAt: string | null;
  readyAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lines: OrderLine[] | null;
}

export interface SalesSummary {
  ticketDate: string;
  orders: number;
  pending: number;
  printed: number;
  ready: number;
  cancelled: number;
  total: number;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  PRINTED: 'En almacén',
  READY: 'Listo en caja',
  CANCELLED: 'Anulado',
};

/** Clases de color de cada estado (insignias). */
export const STATUS_CLASSES: Record<OrderStatus, string> = {
  PENDING: 'bg-warning/15 text-warning',
  PRINTED: 'bg-info/15 text-info',
  READY: 'bg-success/15 text-success',
  CANCELLED: 'bg-danger/10 text-danger line-through',
};

// ---------- Administración ----------

export interface Course extends Record<string, unknown> {
  courseId: number;
  name: string;
  level: string;
  displayOrder: number;
  isActive: boolean;
  itemCount: number;
}

export interface CourseProduct {
  productId: number;
  code: string | null;
  name: string;
  price: number;
  isDefaultSelected: boolean;
}

export interface Product extends Record<string, unknown> {
  productId: number;
  code: string | null;
  name: string;
  section: ProductSection;
  accountGroup: string | null;
  garmentName: string | null;
  size: string | null;
  sizeOrder: number;
  price: number;
  unitCost: number | null;
  stock: number;
  isActive: boolean;
}

export const SECTION_LABELS: Record<ProductSection, string> = {
  TEXT: 'Textos',
  NOTEBOOK: 'Cuadernos',
  UNIFORM: 'Uniformes',
  OTHER: 'Otros',
};
