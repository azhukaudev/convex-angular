import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { DemoAuthService } from '../../auth/demo-auth.service';
import AuthLogin from './auth-login';

jest.mock('../../auth/demo-auth.service', () => {
  class MockDemoAuthService {}

  return { DemoAuthService: MockDemoAuthService };
});

class ResizeObserverStub {
  disconnect(): undefined {
    return undefined;
  }

  observe(): undefined {
    return undefined;
  }

  unobserve(): undefined {
    return undefined;
  }
}

describe('AuthLogin', () => {
  let fixture: ComponentFixture<AuthLogin>;
  let component: AuthLogin;
  let router: { navigateByUrl: jest.Mock };
  let authService: {
    error: ReturnType<typeof signal<Error | undefined>>;
    formErrorMessage: ReturnType<typeof signal<string | null>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    signIn: jest.Mock<Promise<boolean>, [string, string]>;
    signUp: jest.Mock<Promise<boolean>, [string, string, string]>;
    clearFormError: jest.Mock;
  };

  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub,
    });
  });

  function createActivatedRoute(returnUrl: string | null): ActivatedRoute {
    const queryParamMap = convertToParamMap(returnUrl ? { returnUrl } : {});

    return {
      snapshot: {
        queryParamMap,
      },
    } as ActivatedRoute;
  }

  async function setup(returnUrl: string | null = null): Promise<void> {
    router = {
      navigateByUrl: jest.fn().mockResolvedValue(true),
    };
    authService = {
      error: signal<Error | undefined>(undefined),
      formErrorMessage: signal<string | null>(null),
      isLoading: signal(false),
      signIn: jest.fn().mockResolvedValue(true),
      signUp: jest.fn().mockResolvedValue(true),
      clearFormError: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AuthLogin],
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: createActivatedRoute(returnUrl) },
        { provide: DemoAuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthLogin);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('redirects to returnUrl after successful sign-in', async () => {
    await setup('/auth/success?from=guard#done');

    component.authForm.setValue({
      name: '',
      email: 'user@example.com',
      password: 'password123',
    });

    await component.onSubmit();

    expect(authService.signIn).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/success?from=guard#done');
  });

  it('falls back to the success route when returnUrl is missing or unsafe', async () => {
    await setup('//evil.example.com');

    component.authForm.setValue({
      name: '',
      email: 'user@example.com',
      password: 'password123',
    });

    await component.onSubmit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/success');
  });
});
