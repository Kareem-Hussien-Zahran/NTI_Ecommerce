import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  { path: '', title: 'Home', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
  {
    path: 'shop',
    title: 'Shop',
    loadComponent: () => import('./pages/shop/shop').then((m) => m.Shop),
  },
  {
    path: 'product/:slug',
    loadComponent: () =>
      import('./pages/product-detail/product-detail').then((m) => m.ProductDetail),
  },
  {
    path: 'cart',
    title: 'Cart',
    loadComponent: () => import('./pages/cart/cart').then((m) => m.CartPage),
  },
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Create account',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/register/register').then((m) => m.Register),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'checkout',
        title: 'Checkout',
        loadComponent: () => import('./pages/checkout/checkout').then((m) => m.Checkout),
      },
      {
        path: 'orders',
        title: 'My orders',
        loadComponent: () => import('./pages/orders/orders').then((m) => m.Orders),
      },
      {
        path: 'orders/:id',
        title: 'Order',
        loadComponent: () =>
          import('./pages/orders/order-detail/order-detail').then((m) => m.OrderDetail),
      },
      {
        path: 'wishlist',
        title: 'Wishlist',
        loadComponent: () => import('./pages/wishlist/wishlist').then((m) => m.Wishlist),
      },
      {
        path: 'profile',
        title: 'My account',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./pages/admin/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'products',
        title: 'Products',
        loadComponent: () => import('./pages/admin/products/products').then((m) => m.AdminProducts),
      },
      {
        path: 'products/new',
        title: 'New product',
        loadComponent: () =>
          import('./pages/admin/product-form/product-form').then((m) => m.ProductForm),
      },
      {
        path: 'products/:id',
        title: 'Edit product',
        loadComponent: () =>
          import('./pages/admin/product-form/product-form').then((m) => m.ProductForm),
      },
      {
        path: 'orders',
        title: 'Orders',
        loadComponent: () =>
          import('./pages/admin/admin-orders/admin-orders').then((m) => m.AdminOrders),
      },
      {
        path: 'reports',
        title: 'Reports',
        loadComponent: () => import('./pages/admin/reports/reports').then((m) => m.Reports),
      },
      {
        path: 'system',
        title: 'System & logs',
        loadComponent: () => import('./pages/admin/system/system').then((m) => m.SystemPage),
      },
      {
        path: 'users',
        title: 'Users',
        loadComponent: () => import('./pages/admin/users/users').then((m) => m.Users),
      },
      {
        path: 'catalog',
        title: 'Categories & brands',
        loadComponent: () => import('./pages/admin/catalog/catalog').then((m) => m.CatalogAdmin),
      },
    ],
  },
  {
    path: '**',
    title: 'Not found',
    loadComponent: () => import('./shared/notfound/notfound').then((m) => m.Notfound),
  },
];
