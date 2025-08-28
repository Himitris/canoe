import React, { createContext, useContext, useEffect, useState } from 'react';
import { DatabaseService } from '../../services/DatabaseService';

interface DatabaseContextType {
  db: DatabaseService | null;
  isReady: boolean;
}

const DatabaseContext = createContext<DatabaseContextType>({
  db: null,
  isReady: false,
});

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within DatabaseProvider');
  }
  return context;
}

interface DatabaseProviderProps {
  children: React.ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [db, setDb] = useState<DatabaseService | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        const database = new DatabaseService();
        await database.initialize();
        setDb(database);
        setIsReady(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
      }
    };

    initializeDatabase();
  }, []);

  return (
    <DatabaseContext.Provider value={{ db, isReady }}>
      {children}
    </DatabaseContext.Provider>
  );
}