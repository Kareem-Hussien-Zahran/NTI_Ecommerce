import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { debounceTime } from 'rxjs';
import { Api } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { Paginated, User, errMsg } from '../../../core/models';
import { confirm } from '../../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-users',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatTableModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatPaginatorModule,
  ],
  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class Users {
  private api = inject(Api);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  protected statuses = ['active', 'inactive', 'suspended', 'banned'];
  protected cols = ['name', 'joined', 'role', 'status', 'actions'];
  protected data = signal<Paginated<User> | null>(null);
  protected q = new FormControl('', { nonNullable: true });

  constructor() {
    this.load(1);
    this.q.valueChanges.pipe(debounceTime(300)).subscribe(() => this.load(1));
  }
  protected isMe(u: User) {
    return u._id === this.auth.user()?._id;
  }
  protected load(page: number) {
    this.api.users({ page, q: this.q.value, limit: 15 }).subscribe((d) => this.data.set(d));
  }
  protected update(u: User, body: Partial<User>) {
    this.api.updateUser(u._id, body).subscribe({
      next: () => this.snack.open('User updated', undefined, { duration: 1500 }),
      error: (e) => this.snack.open(errMsg(e), 'OK'),
    });
  }
  protected remove(u: User) {
    confirm(this.dialog, {
      title: `Delete ${u.fullName}?`,
      message: 'This cannot be undone.',
      confirm: 'Delete',
    }).subscribe((ok) => {
      if (ok)
        this.api
          .deleteUser(u._id)
          .subscribe({ next: () => this.load(1), error: (e) => this.snack.open(errMsg(e), 'OK') });
    });
  }
}
