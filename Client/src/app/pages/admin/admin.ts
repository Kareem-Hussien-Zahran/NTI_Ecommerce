import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  protected links = [
    { path: 'dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { path: 'products', label: 'Products', icon: 'inventory_2' },
    { path: 'orders', label: 'Orders', icon: 'receipt_long' },
    { path: 'reports', label: 'Reports', icon: 'insights' },
    { path: 'system', label: 'System & logs', icon: 'monitor_heart' },
    { path: 'users', label: 'Users', icon: 'group' },
    { path: 'catalog', label: 'Categories & brands', icon: 'category' },
  ];
}
