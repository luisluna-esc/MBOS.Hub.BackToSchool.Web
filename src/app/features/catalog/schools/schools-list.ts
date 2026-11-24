import { Icon } from '../../../shared/components/icon/icon';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FIELD_RULES, nameError, priceError } from '../../../core/forms/field-rules';
import { AllowedCharsDirective } from '../../../shared/directives/allowed-chars.directive';
import { School } from '../../../core/sales/sales.models';
import { SalesService, apiError } from '../../../core/sales/sales.service';
import { ToastService } from '../../../core/toast/toast.service';

/** Unidades educativas que aparecen en la pantalla del promotor. */
@Component({
  selector: 'app-schools-list',
  imports: [FormsModule, Icon, AllowedCharsDirective],
  template: `
    <div class="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 class="text-xl font-semibold text-foreground">Colegios</h1>
        <p class="text-sm text-muted-foreground">Las unidades educativas que el promotor elige en los datos del pedido.</p>
      </div>

      <form class="flex gap-2" (ngSubmit)="add()">
        <input class="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-foreground" name="newName"
          placeholder="Nombre del colegio" appAllowed="name" [maxlength]="rules.schoolName.max" [(ngModel)]="newName" />
        <button type="submit" class="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40" [disabled]="!newName.trim()"><app-icon name="add-square" size="size-4" /> Agregar</button>
      </form>

      <ul class="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        @for (school of schools(); track school.schoolId) {
          <li class="flex items-center gap-3 px-3 py-2">
            <input class="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-foreground focus:border-border"
              [class.line-through]="!school.isActive" appAllowed="name" [maxlength]="rules.schoolName.max" [ngModel]="school.name" (change)="rename(school, $any($event.target).value)" />
            <button type="button" class="rounded-full border px-3 py-1 text-xs"
              [class]="school.isActive ? 'border-success text-success' : 'border-border text-muted-foreground'"
              (click)="toggleActive(school)">
              {{ school.isActive ? 'Activo' : 'Inactivo' }}
            </button>
          </li>
        } @empty {
          <li class="px-3 py-6 text-center text-sm text-muted-foreground">Todavía no hay colegios.</li>
        }
      </ul>
    </div>
  `,
})
export class SchoolsList {
  private readonly salesService = inject(SalesService);
  private readonly toastService = inject(ToastService);

  protected readonly schools = signal<School[]>([]);
  protected newName = '';
  protected readonly rules = FIELD_RULES;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.schools.set(await this.salesService.schools(true));
  }

  protected async add(): Promise<void> {
    const name = this.newName.trim();
    const error = nameError(name, FIELD_RULES.schoolName);
    if (error) {
      this.toastService.warning('Nombre del colegio', error);
      return;
    }
    if (await this.save({ name, isActive: true, displayOrder: this.schools().length + 1 })) {
      this.newName = '';
    }
  }

  protected toggleActive(school: School): void {
    void this.save({ ...school, isActive: !school.isActive });
  }

  protected rename(school: School, name: string): void {
    const error = nameError(name, FIELD_RULES.schoolName);
    if (error) {
      this.toastService.warning('Nombre del colegio', error);
      void this.load();
      return;
    }
    if (name.trim() !== school.name) {
      void this.save({ ...school, name: name.trim() });
    }
  }

  protected async save(school: Partial<School>): Promise<boolean> {
    try {
      await this.salesService.saveSchool(school);
      this.salesService.orderForm.set(null);
      this.toastService.success('Colegio guardado');
      await this.load();
      return true;
    } catch (error) {
      this.toastService.error('No se pudo guardar', apiError(error));
      await this.load();
      return false;
    }
  }
}
