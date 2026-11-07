import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrazoSettingsModalComponent } from './trazo-settings-modal.component';
import {
  TrazoSettings,
  TrazoSettingsValues,
} from '../../../../../core/services/ai-assistant.service';

const settings: TrazoSettings = {
  delivery: 'apply',
  style: 'mentor',
  creativity: 'balanced',
  model: 'trazo',
  models: ['trazo', 'qwen2.5-coder:7b'],
};

describe('TrazoSettingsModalComponent', () => {
  let fixture: ComponentFixture<TrazoSettingsModalComponent>;
  let component: TrazoSettingsModalComponent;

  const create = (canEdit: boolean) => {
    fixture = TestBed.createComponent(TrazoSettingsModalComponent);
    fixture.componentRef.setInput('settings', settings);
    fixture.componentRef.setInput('canEdit', canEdit);
    fixture.detectChanges();
    component = fixture.componentInstance;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrazoSettingsModalComponent],
    }).compileComponents();
  });

  it('parte de la configuración guardada y no deja guardar sin cambios', () => {
    create(true);
    expect(component.draft()).toEqual({
      delivery: 'apply',
      style: 'mentor',
      creativity: 'balanced',
      model: 'trazo',
    });
    expect(component.isDirty()).toBe(false);
  });

  it('emite la configuración elegida al guardar', () => {
    create(true);
    let saved: TrazoSettingsValues | undefined;
    component.save.subscribe((values) => (saved = values));

    component.set('delivery', 'propose');
    component.set('model', 'qwen2.5-coder:7b');
    expect(component.isDirty()).toBe(true);
    component.submit();

    expect(saved).toEqual({
      delivery: 'propose',
      style: 'mentor',
      creativity: 'balanced',
      model: 'qwen2.5-coder:7b',
    });
  });

  it('un lector la ve pero no la cambia', () => {
    create(false);
    let emitted = false;
    component.save.subscribe(() => (emitted = true));

    component.set('delivery', 'explain');
    component.submit();

    expect(component.draft().delivery).toBe('apply');
    expect(emitted).toBe(false);
    const text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Solo los editores');
  });

  it('vuelve a lo guardado cuando otra persona cambia la configuración', () => {
    create(true);
    component.set('style', 'brief');
    fixture.componentRef.setInput('settings', { ...settings, delivery: 'explain' });
    fixture.detectChanges();

    expect(component.draft()).toMatchObject({ delivery: 'explain', style: 'mentor' });
  });
});
