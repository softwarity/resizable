import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MatIconModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],  
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {}
