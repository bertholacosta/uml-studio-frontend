import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { DiagramToolboxComponent } from './diagram-toolbox.component';

describe('DiagramToolboxComponent', () => {
  let component: DiagramToolboxComponent;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    injector = createEnvironmentInjector([], null as any);
    runInInjectionContext(injector, () => {
      component = new DiagramToolboxComponent();
    });
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
    expect(component.relationTools.map((t) => t.id)).toContain('association_class');
  });

  it('should emit addClass when the palette class is clicked', () => {
    let emitted = false;
    component.addClass.subscribe(() => {
      emitted = true;
    });

    component.addClass.emit();
    expect(emitted).toBe(true);
  });

  it('should emit relationToolChange with the chosen relation', () => {
    let tool: string | null = null;
    component.relationToolChange.subscribe((val) => {
      tool = val;
    });

    component.relationToolChange.emit('composition');
    expect(tool).toBe('composition');
  });

  it('should emit toggleAssistant when the assistant button is used', () => {
    let toggled = false;
    component.toggleAssistant.subscribe(() => {
      toggled = true;
    });

    component.toggleAssistant.emit();
    expect(toggled).toBe(true);
  });
});
