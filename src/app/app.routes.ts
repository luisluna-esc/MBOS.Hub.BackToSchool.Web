import { Routes } from '@angular/router';
import { Observable } from 'rxjs';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/dashboard/home/home').then((m) => m.Home),
      },
      {
        path: 'orders/new',
        loadComponent: () => import('./features/orders/order-create/order-create').then((m) => m.OrderCreate),
        // Si el promotor sale con un pedido a medio cargar, se le pregunta antes de perderlo.
        canDeactivate: [(component: { confirmLeave(): boolean | Observable<boolean> }) => component.confirmLeave()],
      },
      {
        path: 'orders',
        loadComponent: () => import('./features/orders/orders-list/orders-list').then((m) => m.OrdersList),
      },
      {
        path: 'warehouse',
        loadComponent: () => import('./features/warehouse/warehouse-queue').then((m) => m.WarehouseQueue),
      },
      {
        path: 'catalog/products',
        loadComponent: () => import('./features/catalog/products/products-list').then((m) => m.ProductsList),
      },
      {
        path: 'catalog/courses',
        loadComponent: () => import('./features/catalog/courses/course-lists').then((m) => m.CourseLists),
      },
      {
        path: 'catalog/schools',
        loadComponent: () => import('./features/catalog/schools/schools-list').then((m) => m.SchoolsList),
      },
      {
        path: 'admin/roles',
        loadComponent: () => import('./features/admin/roles/roles-list/roles-list').then((m) => m.RolesList),
      },
      {
        path: 'admin/permissions',
        loadComponent: () =>
          import('./features/admin/permissions/permissions-list/permissions-list').then((m) => m.PermissionsList),
      },
      {
        path: 'admin/users',
        loadComponent: () => import('./features/admin/users/users-list/users-list').then((m) => m.UsersList),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./shared/components/error-state/error-state').then((m) => m.ErrorState),
    data: { code: 404 },
  },
];
