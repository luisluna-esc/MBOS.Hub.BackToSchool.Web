import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';

/**
 * Qué caracteres acepta un campo de texto:
 * - digits: solo números (CI/NIT, celular, código).
 * - name: letras (con tildes y ñ), números, espacios y . , & ' - (nombres y razón social).
 * - letters: letras, espacios y . - (prenda, sin números).
 * - text: cualquier texto, sin caracteres de control.
 */
export type AllowedChars = 'digits' | 'name' | 'letters' | 'text';

const RULES: Record<AllowedChars, RegExp> = {
  digits: /[^0-9]/g,
  name: /[^\p{L}\p{M}0-9 .,&'\-]/gu,
  letters: /[^\p{L}\p{M} .\-]/gu,
  text: /[\u0000-\u001F\u007F]/g,
};

/**
 * Limpia lo que se escribe o pega en un <input>/<textarea> según `appAllowed`. Trabaja sobre el
 * evento "input" (no sobre las teclas) porque los teclados de celular, sobre todo en Android, no
 * informan qué tecla se tocó. También quita los espacios dobles y del inicio.
 */
@Directive({
  selector: 'input[appAllowed], textarea[appAllowed]',
})
export class AllowedCharsDirective {
  readonly appAllowed = input.required<AllowedChars>();

  private readonly element = inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef).nativeElement;

  @HostListener('input')
  protected onInput(): void {
    const value = this.element.value;
    let clean = value.replace(RULES[this.appAllowed()], '');
    if (this.appAllowed() !== 'digits') {
      clean = clean.replace(/^\s+/, '').replace(/ {2,}/g, ' ');
    }
    const max = this.element.maxLength;
    if (max > 0 && clean.length > max) {
      clean = clean.slice(0, max);
    }
    if (clean !== value) {
      const caret = Math.max(0, (this.element.selectionStart ?? clean.length) - (value.length - clean.length));
      this.element.value = clean;
      this.element.setSelectionRange?.(caret, caret);
      // Avisar al ngModel del valor limpio (este segundo "input" ya no cambia nada y no se repite).
      this.element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
