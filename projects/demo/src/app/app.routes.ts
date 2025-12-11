import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        outlet: 'playground',
        loadComponent: () => import('./playground/playground.component').then(m => m.PlaygroundComponent)
      },
      {
        path: '',
        outlet: 'documentation',
        loadComponent: () => import('./documentation/documentation.component').then(m => m.DocumentationComponent)
      }
    ]
  }
];
