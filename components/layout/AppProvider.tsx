import React from 'react';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { DatabaseProvider } from '../database/DatabaseProvider';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1976D2',
    secondary: '#0D47A1',
    tertiary: '#2196F3',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F5',
    background: '#FAFAFA',
    error: '#D32F2F',
    success: '#388E3C',
    warning: '#F57C00',
  },
};

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  return (
    <PaperProvider theme={theme}>
      <DatabaseProvider>
        {children}
      </DatabaseProvider>
    </PaperProvider>
  );
}