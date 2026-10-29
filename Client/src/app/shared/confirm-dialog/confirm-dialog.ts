import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { map } from 'rxjs';

@Component({
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './confirm-dialog.html',
})
export class ConfirmDialog {
  protected data = inject<{ title: string; message: string; confirm?: string }>(MAT_DIALOG_DATA);
}

/** confirm(dialog, {...}).subscribe(() => …) runs only when the user confirms. */
export const confirm = (
  dialog: MatDialog,
  data: { title: string; message: string; confirm?: string },
) =>
  dialog
    .open(ConfirmDialog, { data, width: '400px' })
    .afterClosed()
    .pipe(map((r) => r === true));
