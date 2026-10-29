import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-notfound',
  imports: [RouterLink, MatButtonModule],
  templateUrl: './notfound.html',
  styleUrl: './notfound.css',
})
export class Notfound {}
