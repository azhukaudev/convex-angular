import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Message } from './message';

describe('Message', () => {
  let fixture: ComponentFixture<Message>;

  async function setup(severity: 'error' | 'warn', text: string): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Message],
    }).compileComponents();

    fixture = TestBed.createComponent(Message);
    fixture.componentRef.setInput('severity', severity);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the text in an alert with the severity class', async () => {
    await setup('error', 'Something failed');

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Something failed');
    expect(alert.classList).toContain('message--error');
  });

  it('applies the warn class and icon for warn severity', async () => {
    await setup('warn', 'Heads up');

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.classList).toContain('message--warn');
    expect(alert.querySelector('mat-icon')?.textContent).toContain('warning');
  });
});
