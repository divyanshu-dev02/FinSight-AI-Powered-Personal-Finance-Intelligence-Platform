import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, ApiResponse } from '@/lib/api';
import { User, AuthResponse } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginDemo: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cached = window.localStorage.getItem('user');
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore corrupted json
        }
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const token = window.localStorage.getItem('accessToken');
      const cached = window.localStorage.getItem('user');
      // If we already have token AND cached user, don't block initial render with a full-screen spinner
      if (token && cached) {
        return false;
      }
    }
    return true;
  });

  useEffect(() => {
    const initAuth = async () => {
      if (typeof window === 'undefined' || !window.localStorage) {
        setIsLoading(false);
        return;
      }
      const token = window.localStorage.getItem('accessToken');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<ApiResponse<User>>('/auth/me');
        if (response.data.success && response.data.data) {
          setUser(response.data.data);
          window.localStorage.setItem('user', JSON.stringify(response.data.data));
        } else {
          window.localStorage.removeItem('accessToken');
          window.localStorage.removeItem('refreshToken');
          window.localStorage.removeItem('user');
          setUser(null);
        }
      } catch {
        window.localStorage.removeItem('accessToken');
        window.localStorage.removeItem('refreshToken');
        window.localStorage.removeItem('user');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const acceptSession = ({ accessToken, refreshToken, user: authUser }: AuthResponse) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(authUser));
    setUser(authUser);
  };

  const login = async (email: string, password: string) => {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', { email, password });
    acceptSession(response.data.data);
  };

  const loginDemo = async () => {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/demo');
    acceptSession(response.data.data);
  };

  const register = async (email: string, password: string, displayName: string) => {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/register', { email, password, displayName });
    acceptSession(response.data.data);
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Continue client-side cleanup regardless of API error
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      setUser(null);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginDemo,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Keep the hook next to its private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

