/**
 * Reglas de los campos de BackToSchool: largo mínimo/máximo y formato. Las mismas reglas se
 * validan en la API (SaleOrderService / CatalogService); si se cambia una, cambiarla en los dos.
 */
export const FIELD_RULES = {
  customerName: { min: 3, max: 150 },
  taxId: { min: 5, max: 15 },
  phone: { length: 8 },
  notes: { max: 500 },
  manualText: { min: 3, max: 150 },
  price: { min: 0, max: 99_999 },
  schoolName: { min: 3, max: 150 },
  productName: { min: 3, max: 250 },
  productCode: { max: 20 },
  garment: { min: 2, max: 150 },
  size: { max: 20 },
  search: { max: 100 },
} as const;

/** Error del nombre o razón social (null si está bien). */
export function customerNameError(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Es obligatorio para la factura.';
  if (v.length < FIELD_RULES.customerName.min) return `Mínimo ${FIELD_RULES.customerName.min} caracteres.`;
  if (!/\p{L}/u.test(v)) return 'Debe tener letras.';
  return null;
}

/** CI o NIT: opcional; si se escribe, solo números y entre 5 y 15 dígitos. */
export function taxIdError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return 'Solo números.';
  if (v.length < FIELD_RULES.taxId.min) return `Mínimo ${FIELD_RULES.taxId.min} dígitos.`;
  return null;
}

/** Celular de Bolivia: opcional; si se escribe, 8 dígitos que empiezan con 6 o 7. */
export function phoneError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return 'Solo números.';
  if (v.length !== FIELD_RULES.phone.length) return `Debe tener ${FIELD_RULES.phone.length} dígitos.`;
  if (!/^[67]/.test(v)) return 'Debe empezar con 6 o 7.';
  return null;
}

/** Texto escrito a mano por el promotor. */
export function manualTextError(name: string, price: number | null): string | null {
  const v = name.trim();
  if (v.length < FIELD_RULES.manualText.min) return `Escriba el nombre del texto (mínimo ${FIELD_RULES.manualText.min} letras).`;
  return priceError(price, true);
}

/** Precio en bolivianos, con hasta 2 decimales. */
export function priceError(price: number | string | null, required = false): string | null {
  if (price === null || price === '') return required ? 'Escriba el precio.' : null;
  const n = Number(price);
  if (Number.isNaN(n)) return 'El precio no es un número.';
  if (n < FIELD_RULES.price.min) return 'El precio no puede ser negativo.';
  if (n > FIELD_RULES.price.max) return `El precio máximo es ${FIELD_RULES.price.max}.`;
  if (Math.round(n * 100) !== n * 100) return 'Máximo 2 decimales.';
  return null;
}

/** Nombre de colegio o producto: largo mínimo y que tenga letras. */
export function nameError(value: string, rule: { min: number }): string | null {
  const v = value.trim();
  if (v.length < rule.min) return `Mínimo ${rule.min} caracteres.`;
  if (!/\p{L}/u.test(v)) return 'Debe tener letras.';
  return null;
}
