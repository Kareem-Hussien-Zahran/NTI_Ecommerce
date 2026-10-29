import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CartService } from '../../core/cart.service';
import { errMsg } from '../../core/models';

@Component({
  selector: 'app-checkout',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatIconModule,
  ],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class Checkout {
  private fb = inject(FormBuilder);
  private api = inject(Api);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);
  protected cart = inject(CartService);
  protected busy = signal(false);
  private req = [Validators.required];

  protected form = this.fb.nonNullable.group({
    fullName: ['', this.req],
    phone: ['', this.req],
    street: ['', this.req],
    city: ['', this.req],
    state: [''],
    postalCode: ['', this.req],
    country: ['', this.req],
    paymentMethod: ['cod' as 'cod' | 'card'],
  });

  constructor() {
    const u = this.auth.user();
    if (u) this.form.patchValue({ fullName: u.fullName, phone: u.phone ?? '', ...u.address });
  }

  protected place() {
    const { paymentMethod, ...shippingAddress } = this.form.getRawValue();
    this.busy.set(true);
    this.api.placeOrder({ shippingAddress, paymentMethod }).subscribe({
      next: (o) => {
        this.cart.reset();
        this.snack.open('Order placed 🎉', undefined, { duration: 3000 });
        this.router.navigate(['/orders', o._id]);
      },
      error: (e) => {
        this.busy.set(false);
        this.snack.open(errMsg(e), 'OK', { duration: 5000 });
      },
    });
  }
}
