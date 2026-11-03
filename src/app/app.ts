import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TourOverlayComponent } from './core/tour/tour-overlay.component';

@Component({
  imports: [RouterOutlet, TourOverlayComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend');
}
