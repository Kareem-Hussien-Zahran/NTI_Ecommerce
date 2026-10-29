import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { errMsg } from '../../core/models';
import { confirm } from '../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-profile',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile {
  private fb = inject(FormBuilder);
  private api = inject(Api);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  protected auth = inject(AuthService);
  private u = this.auth.user();
  private req = [Validators.required];

  protected profile = this.fb.nonNullable.group({
    firstName: [this.u?.firstName ?? '', [Validators.required, Validators.minLength(2)]],
    lastName: [this.u?.lastName ?? '', [Validators.required, Validators.minLength(2)]],
    phone: this.u?.phone ?? '',
  });
  protected address = this.fb.nonNullable.group({
    fullName: [this.u?.address?.fullName ?? this.u?.fullName ?? '', this.req],
    phone: [this.u?.address?.phone ?? this.u?.phone ?? '', this.req],
    street: [this.u?.address?.street ?? '', this.req],
    city: [this.u?.address?.city ?? '', this.req],
    state: this.u?.address?.state ?? '',
    postalCode: [this.u?.address?.postalCode ?? '', this.req],
    country: [this.u?.address?.country ?? '', this.req],
  });
  protected pw = this.fb.nonNullable.group({
    currentPassword: ['', this.req],
    newPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
      ],
    ],
  });

  private done = (msg: string, f?: { markAsPristine(): void; reset?: () => void }) => ({
    next: () => {
      this.snack.open(msg, undefined, { duration: 2000 });
      f?.markAsPristine();
    },
    error: (e: unknown) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
  });

  protected saveProfile() {
    const v = this.profile.getRawValue();
    this.auth
      .updateProfile({
        firstName: v.firstName,
        lastName: v.lastName,
        ...(v.phone && { phone: v.phone }),
      })
      .subscribe(this.done('Profile updated', this.profile));
  }
  protected saveAddress() {
    this.auth
      .updateProfile({ address: this.address.getRawValue() })
      .subscribe(this.done('Address saved', this.address));
  }
  protected changePw() {
    const { currentPassword, newPassword } = this.pw.getRawValue();
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.snack.open('Password changed', undefined, { duration: 2000 });
        this.pw.reset();
      },
      error: (e) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
    });
  }
  protected remove() {
    confirm(this.dialog, {
      title: 'Delete your account?',
      message: 'This cannot be undone.',
      confirm: 'Delete',
    }).subscribe((ok) => {
      if (ok) this.api.deleteMe().subscribe(() => this.auth.logout());
    });
  }
}
