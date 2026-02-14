import { Injectable, signal } from '@angular/core';
import { ConvexAuthProvider } from 'convex-angular';

/**
 * Mock authentication service for demo purposes.
 *
 * This service simulates a real authentication provider using localStorage
 * for persistence. It demonstrates how to integrate a custom auth provider
 * with convex-angular by implementing `ConvexAuthProvider`.
 *
 * Valid credentials: admin/admin
 */
@Injectable({ providedIn: 'root' })
export class MockAuthService implements ConvexAuthProvider {
  private readonly STORAGE_KEY = 'convex_auth_demo';

  /** Whether the auth state is still being determined */
  readonly isLoading = signal(true);

  /** Whether the user is currently authenticated */
  readonly isAuthenticated = signal(false);

  /** Error message from the last failed login attempt */
  readonly error = signal<string | null>(null);

  constructor() {
    // Check localStorage on initialization
    const stored = localStorage.getItem(this.STORAGE_KEY);
    this.isAuthenticated.set(stored === 'true');
    this.isLoading.set(false);
  }

  /**
   * Attempt to log in with the given credentials.
   *
   * @param username - The username (must be "admin")
   * @param password - The password (must be "admin")
   * @returns true if login was successful, false otherwise
   */
  login(username: string, password: string): boolean {
    this.error.set(null);

    if (username === 'admin' && password === 'admin') {
      localStorage.setItem(this.STORAGE_KEY, 'true');
      this.isAuthenticated.set(true);
      return true;
    }

    this.error.set('Invalid credentials. Use admin/admin.');
    return false;
  }

  /**
   * Log out the current user.
   */
  logout(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.isAuthenticated.set(false);
    this.error.set(null);
  }

  /**
   * Fetch the access token for the current session.
   * In a real app, this would call your auth provider's API.
   *
   * @param args.forceRefreshToken - Whether to force a token refresh
   * @returns A mock JWT token if authenticated, null otherwise
   */
  readonly fetchAccessToken = async (): Promise<string | null> =>
    this.isAuthenticated() ? 'mock-jwt-token-for-demo' : null;
}
