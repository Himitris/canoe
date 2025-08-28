import * as SQLite from 'expo-sqlite';
import { format } from 'date-fns';

export interface Reservation {
  id?: number;
  name: string;
  date: string;
  nb_people: number;
  single_canoes: number;
  double_canoes: number;
  arrival_time: string;
  timeslot: 'morning' | 'afternoon' | 'full_day';
  status: 'pending' | 'on_water' | 'completed' | 'canceled';
  created_at?: string;
  updated_at?: string;
  actual_arrival_time?: string;
  departure_time?: string;
  return_time?: string;
}

export interface ReservationHistory {
  id?: number;
  reservation_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  changed_at: string;
  changed_by?: string;
}

export interface Settings {
  total_single_canoes: number;
  total_double_canoes: number;
  auto_backup_enabled: boolean;
  last_backup_date?: string;
  morning_start_time?: string; // Format HH:MM, ex: "09:00"
  morning_end_time?: string; // Format HH:MM, ex: "13:00"
  afternoon_start_time?: string; // Format HH:MM, ex: "14:00"
  afternoon_end_time?: string; // Format HH:MM, ex: "18:00"
}

export interface DailyStats {
  date: string;
  total_reservations: number;
  total_people: number;
  morning_occupancy: number;
  afternoon_occupancy: number;
  full_day_occupancy: number;
  revenue_estimate?: number;
}

export class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize() {
    this.db = await SQLite.openDatabaseAsync('canoe_rentals.db');
    await this.createTables();
    await this.initializeSettings();
    await this.migrateReservationStatuses();
    await this.verifyDatabaseIntegrity();
  }

  private async verifyDatabaseIntegrity() {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const testId = await this.db.runAsync(
        'INSERT INTO reservations (name, date, nb_people, arrival_time, timeslot, status) VALUES (?, ?, ?, ?, ?, ?)',
        ['__TEST__', '2025-01-01', 1, '09:00', 'morning', 'pending']
      );
      const validStatuses = ['on_water', 'completed', 'canceled'];
      for (const status of validStatuses) {
        await this.db.runAsync(
          'UPDATE reservations SET status = ? WHERE id = ?',
          [status, testId.lastInsertRowId]
        );
      }
      await this.db.runAsync(
        "DELETE FROM reservations WHERE name = '__TEST__'"
      );
      console.log(
        '✅ Base de données vérifiée - tous les statuts sont valides'
      );
    } catch (error) {
      console.error('❌ Erreur de vérification de la base de données:', error);
      throw new Error("La base de données n'est pas correctement configurée");
    }
  }

  private async createTables() {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync(`DROP TABLE IF EXISTS reservations_old;`);
    try {
      await this.db.execAsync(
        `ALTER TABLE reservations RENAME TO reservations_old;`
      );
    } catch (e) {
      // Table doesn't exist yet, that's fine
    }
    await this.db.execAsync(`
      CREATE TABLE reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        nb_people INTEGER NOT NULL,
        single_canoes INTEGER DEFAULT 0,
        double_canoes INTEGER DEFAULT 0,
        arrival_time TEXT NOT NULL,
        timeslot TEXT NOT NULL CHECK (timeslot IN ('morning', 'afternoon', 'full_day')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'on_water', 'completed', 'canceled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        actual_arrival_time DATETIME,
        departure_time DATETIME,
        return_time DATETIME
      );
    `);
    try {
      await this.db.execAsync(`
        INSERT INTO reservations
        (id, name, date, nb_people, single_canoes, double_canoes, arrival_time, timeslot, status, created_at, updated_at)
        SELECT
          id, name, date, nb_people, single_canoes, double_canoes, arrival_time, timeslot,
          CASE
            WHEN status = 'ongoing' THEN 'on_water'
            ELSE status
          END as status,
          created_at, updated_at
        FROM reservations_old;
      `);
      await this.db.execAsync(`DROP TABLE reservations_old;`);
    } catch (e) {
      console.log('No existing reservations table to migrate');
    }
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS reservation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        changed_by TEXT,
        FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE
      );
    `);
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_single_canoes INTEGER DEFAULT 10,
        total_double_canoes INTEGER DEFAULT 5,
        auto_backup_enabled BOOLEAN DEFAULT 1,
        last_backup_date DATETIME,
        morning_start_time TEXT DEFAULT '09:00',
        morning_end_time TEXT DEFAULT '13:00',
        afternoon_start_time TEXT DEFAULT '14:00',
        afternoon_end_time TEXT DEFAULT '18:00',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS client_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        usage_count INTEGER DEFAULT 1,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_reservations_date_status
      ON reservations(date, status);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_reservations_name
      ON reservations(name);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_client_names_usage
      ON client_names(usage_count DESC, last_used DESC);
    `);
  }

  private async migrateReservationStatuses() {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.runAsync(
        'INSERT INTO reservations (name, date, nb_people, arrival_time, timeslot, status) VALUES (?, ?, ?, ?, ?, ?)',
        ['TEST_MIGRATION', '2025-01-01', 1, '09:00', 'morning', 'on_water']
      );
      await this.db.runAsync(
        "DELETE FROM reservations WHERE name = 'TEST_MIGRATION'"
      );
      await this.db.runAsync(`
        UPDATE reservations SET status = 'on_water'
        WHERE status IN ('ongoing', 'arrived');
      `);
      console.log('Migration réussie - tous les statuts ont été mis à jour');
    } catch (error) {
      console.log('Migration nécessaire - reconstruction de la table...');
      try {
        await this.db.execAsync(`
          CREATE TABLE reservations_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            nb_people INTEGER NOT NULL,
            single_canoes INTEGER DEFAULT 0,
            double_canoes INTEGER DEFAULT 0,
            arrival_time TEXT NOT NULL,
            timeslot TEXT NOT NULL CHECK (timeslot IN ('morning', 'afternoon', 'full_day')),
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'on_water', 'completed', 'canceled')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            actual_arrival_time DATETIME,
            departure_time DATETIME,
            return_time DATETIME
          );
        `);
        await this.db.execAsync(`
          INSERT INTO reservations_new
          (id, name, date, nb_people, single_canoes, double_canoes, arrival_time, timeslot, status, created_at, updated_at, actual_arrival_time, departure_time, return_time)
          SELECT
            id, name, date, nb_people, single_canoes, double_canoes, arrival_time, timeslot,
            CASE
              WHEN status IN ('ongoing', 'arrived') THEN 'on_water'
              WHEN status NOT IN ('pending', 'completed', 'canceled') THEN 'pending'
              ELSE status
            END as status,
            created_at, updated_at, actual_arrival_time, departure_time, return_time
          FROM reservations;
        `);
        await this.db.execAsync(`DROP TABLE reservations;`);
        await this.db.execAsync(
          `ALTER TABLE reservations_new RENAME TO reservations;`
        );
        console.log(
          'Migration complète - table reconstruite avec nouveaux statuts'
        );
      } catch (migrationError) {
        console.error('Erreur lors de la migration:', migrationError);
        await this.createBasicReservationsTable();
      }
    }
  }

  private async createBasicReservationsTable() {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        nb_people INTEGER NOT NULL,
        single_canoes INTEGER DEFAULT 0,
        double_canoes INTEGER DEFAULT 0,
        arrival_time TEXT NOT NULL,
        timeslot TEXT NOT NULL CHECK (timeslot IN ('morning', 'afternoon', 'full_day')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'on_water', 'completed', 'canceled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        actual_arrival_time DATETIME,
        departure_time DATETIME,
        return_time DATETIME
      );
    `);
  }

  private async initializeSettings() {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getFirstAsync(
      'SELECT COUNT(*) as count FROM settings'
    );
    if (result && (result as any).count === 0) {
      await this.db.runAsync(
        'INSERT INTO settings (total_single_canoes, total_double_canoes, auto_backup_enabled, morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [10, 5, 1, '09:00', '13:00', '14:00', '18:00']
      );
    } else {
      // Migration pour ajouter les nouvelles colonnes si elles n'existent pas
      try {
        await this.db.runAsync(
          'ALTER TABLE settings ADD COLUMN morning_start_time TEXT DEFAULT "09:00"'
        );
        await this.db.runAsync(
          'ALTER TABLE settings ADD COLUMN morning_end_time TEXT DEFAULT "13:00"'
        );
        await this.db.runAsync(
          'ALTER TABLE settings ADD COLUMN afternoon_start_time TEXT DEFAULT "14:00"'
        );
        await this.db.runAsync(
          'ALTER TABLE settings ADD COLUMN afternoon_end_time TEXT DEFAULT "18:00"'
        );
      } catch (e) {
        // Les colonnes existent déjà
      }
    }
  }

  async markReservationOnWater(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const currentTime = new Date().toISOString();
    try {
      const reservation = await this.getReservation(id);
      if (!reservation) {
        throw new Error('Reservation not found');
      }
      await this.db.runAsync(
        `
        UPDATE reservations
        SET status = ?,
            actual_arrival_time = COALESCE(actual_arrival_time, ?),
            departure_time = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        ['on_water', currentTime, currentTime, id]
      );
      await this.addReservationHistory(
        id,
        'status',
        reservation.status,
        'on_water'
      );
    } catch (error) {
      console.error("Erreur lors du marquage sur l'eau:", error);
      throw new Error("Impossible de marquer la réservation sur l'eau");
    }
  }

  async markReservationCompleted(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const currentTime = new Date().toISOString();
    try {
      const reservation = await this.getReservation(id);
      if (!reservation) {
        throw new Error('Reservation not found');
      }
      await this.db.runAsync(
        `
        UPDATE reservations
        SET status = ?,
            return_time = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        ['completed', currentTime, id]
      );
      await this.addReservationHistory(
        id,
        'status',
        reservation.status,
        'completed'
      );
    } catch (error) {
      console.error('Erreur lors du marquage terminé:', error);
      throw new Error('Impossible de marquer la réservation comme terminée');
    }
  }

  async updateReservationStatus(
    id: number,
    newStatus: Reservation['status']
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const reservation = await this.getReservation(id);
      if (!reservation) {
        throw new Error('Reservation not found');
      }
      const validStatuses: Reservation['status'][] = [
        'pending',
        'on_water',
        'completed',
        'canceled',
      ];
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
      }
      if (newStatus === 'on_water') {
        await this.markReservationOnWater(id);
        return;
      }
      if (newStatus === 'completed') {
        await this.markReservationCompleted(id);
        return;
      }
      await this.db.runAsync(
        `
        UPDATE reservations
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [newStatus, id]
      );
      await this.addReservationHistory(
        id,
        'status',
        reservation.status,
        newStatus
      );
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      throw error;
    }
  }

  async markReservationArrived(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const currentTime = new Date().toISOString();

    try {
      const reservation = await this.getReservation(id);
      if (!reservation) {
        throw new Error('Reservation not found');
      }

      await this.db.runAsync(
        `
        UPDATE reservations
        SET actual_arrival_time = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [currentTime, id]
      );

      await this.addReservationHistory(
        id,
        'actual_arrival_time',
        reservation.actual_arrival_time || 'null',
        currentTime
      );
    } catch (error) {
      console.error('Erreur lors du marquage arrivé:', error);
      throw new Error('Impossible de marquer la réservation comme arrivée');
    }
  }

  async getArrivedReservations(date: string): Promise<Reservation[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      `
      SELECT * FROM reservations
      WHERE date = ? 
      AND status = 'pending'
      AND actual_arrival_time IS NOT NULL
      ORDER BY actual_arrival_time ASC
    `,
      [date]
    );

    return result as Reservation[];
  }

  async getDetailedStats(date: string): Promise<{
    total: number;
    pending: number;
    arrived: number;
    on_water: number;
    completed: number;
    canceled: number;
    late: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const reservations = await this.getReservations(date);
    const now = new Date();

    const stats = {
      total: reservations.length,
      pending: 0,
      arrived: 0,
      on_water: 0,
      completed: 0,
      canceled: 0,
      late: 0,
    };

    reservations.forEach((reservation) => {
      // Compter par statut
      stats[reservation.status as keyof typeof stats]++;

      // Compter les arrivés (pending avec actual_arrival_time)
      if (reservation.status === 'pending' && reservation.actual_arrival_time) {
        stats.arrived++;
        stats.pending--; // Ajuster car ils ne sont plus vraiment "pending"
      }

      // Compter les retards
      if (
        reservation.status === 'pending' &&
        !reservation.actual_arrival_time
      ) {
        const expectedTime = new Date(
          `${reservation.date}T${reservation.arrival_time}:00`
        );
        if (now > expectedTime) {
          stats.late++;
        }
      }
    });

    return stats;
  }

  async searchReservationsWithFilters(params: {
    date?: string;
    status?: string;
    query?: string;
    includeArrived?: boolean;
  }): Promise<Reservation[]> {
    if (!this.db) throw new Error('Database not initialized');

    let query = 'SELECT * FROM reservations WHERE 1=1';
    const queryParams: any[] = [];

    if (params.date) {
      query += ' AND date = ?';
      queryParams.push(params.date);
    }

    if (params.status && params.status !== 'all') {
      if (params.status === 'arrived') {
        query += " AND status = 'pending' AND actual_arrival_time IS NOT NULL";
      } else if (params.status === 'late') {
        query += " AND status = 'pending' AND actual_arrival_time IS NULL";
        // Note: La logique de retard sera appliquée côté client avec la date/heure actuelle
      } else {
        query += ' AND status = ?';
        queryParams.push(params.status);
      }
    }

    if (params.query && params.query.trim()) {
      query += ' AND (name LIKE ? OR date LIKE ?)';
      const searchPattern = `%${params.query}%`;
      queryParams.push(searchPattern, searchPattern);
    }

    query += ' ORDER BY date DESC, arrival_time ASC';

    const result = await this.db.getAllAsync(query, queryParams);
    return result as Reservation[];
  }

  async getDailySummary(date: string): Promise<{
    reservations: {
      total: number;
      pending: number;
      arrived: number;
      on_water: number;
      completed: number;
      late: number;
    };
    canoes: {
      morning: {
        single_used: number;
        double_used: number;
        single_free: number;
        double_free: number;
      };
      afternoon: {
        single_used: number;
        double_used: number;
        single_free: number;
        double_free: number;
      };
    };
    capacity: {
      total_people: number;
      current_on_water: number;
    };
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const [stats, availability, reservations] = await Promise.all([
      this.getDetailedStats(date),
      this.getAvailability(date),
      this.getReservations(date),
    ]);

    const onWaterReservations = reservations.filter(
      (r) => r.status === 'on_water'
    );
    const currentOnWater = onWaterReservations.reduce(
      (sum, r) => sum + r.nb_people,
      0
    );
    const totalPeople = reservations
      .filter((r) => r.status !== 'canceled')
      .reduce((sum, r) => sum + r.nb_people, 0);

    return {
      reservations: stats,
      canoes: {
        morning: {
          single_used:
            availability.morning.total_single - availability.morning.single,
          double_used:
            availability.morning.total_double - availability.morning.double,
          single_free: availability.morning.single,
          double_free: availability.morning.double,
        },
        afternoon: {
          single_used:
            availability.afternoon.total_single - availability.afternoon.single,
          double_used:
            availability.afternoon.total_double - availability.afternoon.double,
          single_free: availability.afternoon.single,
          double_free: availability.afternoon.double,
        },
      },
      capacity: {
        total_people: totalPeople,
        current_on_water: currentOnWater,
      },
    };
  }

  async getReservationsByStatus(
    date: string,
    status: Reservation['status']
  ): Promise<Reservation[]> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getAllAsync(
      `
      SELECT * FROM reservations
      WHERE date = ? AND status = ?
      ORDER BY arrival_time ASC
    `,
      [date, status]
    );
    return result as Reservation[];
  }

  async getLiveReservations(date: string): Promise<{
    pending: Reservation[];
    on_water: Reservation[];
    completed: Reservation[];
  }> {
    if (!this.db) throw new Error('Database not initialized');
    const [pending, on_water, completed] = await Promise.all([
      this.getReservationsByStatus(date, 'pending'),
      this.getReservationsByStatus(date, 'on_water'),
      this.getReservationsByStatus(date, 'completed'),
    ]);
    return { pending, on_water, completed };
  }

  async getReservations(
    date?: string,
    status?: string
  ): Promise<Reservation[]> {
    if (!this.db) throw new Error('Database not initialized');
    let query = 'SELECT * FROM reservations WHERE 1=1';
    const params: any[] = [];
    if (date) {
      query += ' AND date = ?';
      params.push(date);
    }
    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY date DESC, arrival_time ASC';
    const result = await this.db.getAllAsync(query, params);
    return result as Reservation[];
  }

  async searchReservations(searchQuery: string): Promise<Reservation[]> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getAllAsync(
      `
      SELECT * FROM reservations
      WHERE name LIKE ? OR date LIKE ?
      ORDER BY date DESC, arrival_time ASC
    `,
      [`%${searchQuery}%`, `%${searchQuery}%`]
    );
    return result as Reservation[];
  }

  async getReservation(id: number): Promise<Reservation | null> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getFirstAsync(
      'SELECT * FROM reservations WHERE id = ?',
      [id]
    );
    return result as Reservation | null;
  }

  async createReservation(
    reservation: Omit<Reservation, 'id' | 'created_at' | 'updated_at'>
  ): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.runAsync(
      `
      INSERT INTO reservations
      (name, date, nb_people, single_canoes, double_canoes, arrival_time, timeslot, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        reservation.name,
        reservation.date,
        reservation.nb_people,
        reservation.single_canoes,
        reservation.double_canoes,
        reservation.arrival_time,
        reservation.timeslot,
        reservation.status,
      ]
    );
    await this.updateClientName(reservation.name);
    return result.lastInsertRowId;
  }

  async updateReservation(
    id: number,
    reservation: Partial<Reservation>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const currentReservation = await this.getReservation(id);
    if (!currentReservation) return;
    const fields: string[] = [];
    const values: any[] = [];
    const changes: Array<{
      field: string;
      oldValue: string;
      newValue: string;
    }> = [];
    Object.entries(reservation).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        const currentValue = (currentReservation as any)[key];
        if (currentValue !== value) {
          changes.push({
            field: key,
            oldValue: String(currentValue),
            newValue: String(value),
          });
        }
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    if (fields.length === 0) return;
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await this.db.runAsync(
      `UPDATE reservations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    for (const change of changes) {
      await this.addReservationHistory(
        id,
        change.field,
        change.oldValue,
        change.newValue
      );
    }
    if (reservation.name) {
      await this.updateClientName(reservation.name);
    }
  }

  async duplicateReservation(id: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const original = await this.getReservation(id);
    if (!original) throw new Error('Reservation not found');
    const {
      id: _,
      created_at,
      updated_at,
      actual_arrival_time,
      departure_time,
      return_time,
      ...reservationData
    } = original;
    return await this.createReservation({
      ...reservationData,
      name: `${reservationData.name} (Copy)`,
      status: 'pending',
    });
  }

  async deleteReservation(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM reservations WHERE id = ?', [id]);
  }

  async addReservationHistory(
    reservationId: number,
    fieldName: string,
    oldValue: string,
    newValue: string
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(
      `
      INSERT INTO reservation_history (reservation_id, field_name, old_value, new_value)
      VALUES (?, ?, ?, ?)
    `,
      [reservationId, fieldName, oldValue, newValue]
    );
  }

  async getReservationHistory(
    reservationId: number
  ): Promise<ReservationHistory[]> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getAllAsync(
      `
      SELECT * FROM reservation_history
      WHERE reservation_id = ?
      ORDER BY changed_at DESC
    `,
      [reservationId]
    );
    return result as ReservationHistory[];
  }

  async updateClientName(name: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(
      `
      INSERT INTO client_names (name, usage_count, last_used)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        usage_count = usage_count + 1,
        last_used = CURRENT_TIMESTAMP
    `,
      [name]
    );
  }

  async getClientNameSuggestions(
    query: string,
    limit: number = 5
  ): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getAllAsync(
      `
      SELECT name FROM client_names
      WHERE name LIKE ?
      ORDER BY usage_count DESC, last_used DESC
      LIMIT ?
    `,
      [`%${query}%`, limit]
    );
    return result.map((row: any) => row.name);
  }

  async getSettings(): Promise<Settings> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getFirstAsync(
      'SELECT * FROM settings WHERE id = 1'
    );
    if (!result) {
      throw new Error('Settings not found');
    }
    return result as Settings;
  }

  async updateSettings(settings: Partial<Settings>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const fields: string[] = [];
    const values: any[] = [];
    Object.entries(settings).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    if (fields.length === 0) return;
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(1);
    await this.db.runAsync(
      `UPDATE settings SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  async getAvailability(date: string): Promise<{
    morning: {
      single: number;
      double: number;
      total_single: number;
      total_double: number;
    };
    afternoon: {
      single: number;
      double: number;
      total_single: number;
      total_double: number;
    };
    full_day: {
      single: number;
      double: number;
      total_single: number;
      total_double: number;
    };
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const settings = await this.getSettings();
    const reservations = await this.getReservations(date);

    // Filtrer seulement les réservations actives (pas annulées)
    const activeReservations = reservations.filter(
      (r) => r.status === 'pending' || r.status === 'on_water'
    );

    // Calculer les canoës utilisés par créneau
    let morningUsed = { single: 0, double: 0 };
    let afternoonUsed = { single: 0, double: 0 };

    activeReservations.forEach((reservation) => {
      if (reservation.timeslot === 'morning') {
        // Réservation matin seulement
        morningUsed.single += reservation.single_canoes;
        morningUsed.double += reservation.double_canoes;
      } else if (reservation.timeslot === 'afternoon') {
        // Réservation après-midi seulement
        afternoonUsed.single += reservation.single_canoes;
        afternoonUsed.double += reservation.double_canoes;
      } else if (reservation.timeslot === 'full_day') {
        // Réservation journée complète - bloque les deux créneaux
        morningUsed.single += reservation.single_canoes;
        morningUsed.double += reservation.double_canoes;
        afternoonUsed.single += reservation.single_canoes;
        afternoonUsed.double += reservation.double_canoes;
      }
    });

    // Calculer la disponibilité pour chaque créneau
    const morning = {
      single: Math.max(0, settings.total_single_canoes - morningUsed.single),
      double: Math.max(0, settings.total_double_canoes - morningUsed.double),
      total_single: settings.total_single_canoes,
      total_double: settings.total_double_canoes,
    };

    const afternoon = {
      single: Math.max(0, settings.total_single_canoes - afternoonUsed.single),
      double: Math.max(0, settings.total_double_canoes - afternoonUsed.double),
      total_single: settings.total_single_canoes,
      total_double: settings.total_double_canoes,
    };

    // Pour les réservations journée complète, on ne peut prendre que
    // le minimum entre ce qui reste le matin ET l'après-midi
    const full_day = {
      single: Math.min(morning.single, afternoon.single),
      double: Math.min(morning.double, afternoon.double),
      total_single: settings.total_single_canoes,
      total_double: settings.total_double_canoes,
    };

    return {
      morning,
      afternoon,
      full_day,
    };
  }

  async getDailyStats(date: string): Promise<DailyStats> {
    if (!this.db) throw new Error('Database not initialized');
    const reservations = await this.getReservations(date);
    const activeReservations = reservations.filter(
      (r) => r.status !== 'canceled'
    );
    const settings = await this.getSettings();
    const totalPeople = activeReservations.reduce(
      (sum, r) => sum + r.nb_people,
      0
    );
    const morningReservations = activeReservations.filter(
      (r) => r.timeslot === 'morning' || r.timeslot === 'full_day'
    );
    const afternoonReservations = activeReservations.filter(
      (r) => r.timeslot === 'afternoon' || r.timeslot === 'full_day'
    );
    const fullDayReservations = activeReservations.filter(
      (r) => r.timeslot === 'full_day'
    );
    const morningUsed = morningReservations.reduce(
      (sum, r) => sum + r.single_canoes + r.double_canoes,
      0
    );
    const afternoonUsed = afternoonReservations.reduce(
      (sum, r) => sum + r.single_canoes + r.double_canoes,
      0
    );
    const fullDayUsed = fullDayReservations.reduce(
      (sum, r) => sum + r.single_canoes + r.double_canoes,
      0
    );
    const totalCanoes =
      settings.total_single_canoes + settings.total_double_canoes;
    return {
      date,
      total_reservations: activeReservations.length,
      total_people: totalPeople,
      morning_occupancy:
        totalCanoes > 0 ? (morningUsed / totalCanoes) * 100 : 0,
      afternoon_occupancy:
        totalCanoes > 0 ? (afternoonUsed / totalCanoes) * 100 : 0,
      full_day_occupancy:
        totalCanoes > 0 ? (fullDayUsed / totalCanoes) * 100 : 0,
    };
  }

  async checkOverbooking(
    date: string,
    timeslot: string,
    singleCanoes: number,
    doubleCanoes: number,
    excludeId?: number
  ): Promise<{ isOverbooked: boolean; message?: string }> {
    if (!this.db) throw new Error('Database not initialized');

    const availability = await this.getAvailability(date);

    // Si on modifie une réservation existante, on doit la soustraire du calcul actuel
    if (excludeId) {
      const currentReservation = await this.getReservation(excludeId);
      if (currentReservation && currentReservation.date === date) {
        // Remettre les canoës de cette réservation dans le pool disponible
        const settings = await this.getSettings();

        if (currentReservation.timeslot === 'morning') {
          availability.morning.single = Math.min(
            settings.total_single_canoes,
            availability.morning.single + currentReservation.single_canoes
          );
          availability.morning.double = Math.min(
            settings.total_double_canoes,
            availability.morning.double + currentReservation.double_canoes
          );
          // Recalculer full_day
          availability.full_day.single = Math.min(
            availability.morning.single,
            availability.afternoon.single
          );
          availability.full_day.double = Math.min(
            availability.morning.double,
            availability.afternoon.double
          );
        } else if (currentReservation.timeslot === 'afternoon') {
          availability.afternoon.single = Math.min(
            settings.total_single_canoes,
            availability.afternoon.single + currentReservation.single_canoes
          );
          availability.afternoon.double = Math.min(
            settings.total_double_canoes,
            availability.afternoon.double + currentReservation.double_canoes
          );
          // Recalculer full_day
          availability.full_day.single = Math.min(
            availability.morning.single,
            availability.afternoon.single
          );
          availability.full_day.double = Math.min(
            availability.morning.double,
            availability.afternoon.double
          );
        } else if (currentReservation.timeslot === 'full_day') {
          availability.morning.single = Math.min(
            settings.total_single_canoes,
            availability.morning.single + currentReservation.single_canoes
          );
          availability.morning.double = Math.min(
            settings.total_double_canoes,
            availability.morning.double + currentReservation.double_canoes
          );
          availability.afternoon.single = Math.min(
            settings.total_single_canoes,
            availability.afternoon.single + currentReservation.single_canoes
          );
          availability.afternoon.double = Math.min(
            settings.total_double_canoes,
            availability.afternoon.double + currentReservation.double_canoes
          );
          availability.full_day.single = Math.min(
            availability.morning.single,
            availability.afternoon.single
          );
          availability.full_day.double = Math.min(
            availability.morning.double,
            availability.afternoon.double
          );
        }
      }
    }

    let availableSlot;
    switch (timeslot) {
      case 'morning':
        availableSlot = availability.morning;
        break;
      case 'afternoon':
        availableSlot = availability.afternoon;
        break;
      case 'full_day':
        availableSlot = availability.full_day;
        break;
      default:
        return { isOverbooked: false };
    }

    const singleOverbook = singleCanoes > availableSlot.single;
    const doubleOverbook = doubleCanoes > availableSlot.double;

    if (singleOverbook || doubleOverbook) {
      let message = 'Surbooking détecté: ';
      const issues = [];

      if (singleOverbook) {
        const excess = singleCanoes - availableSlot.single;
        issues.push(`${excess} canoë(s) simple(s) en trop`);
      }

      if (doubleOverbook) {
        const excess = doubleCanoes - availableSlot.double;
        issues.push(`${excess} canoë(s) double(s) en trop`);
      }

      message += issues.join(', ');
      message += `. Disponible: ${availableSlot.single}S + ${availableSlot.double}D`;

      return { isOverbooked: true, message };
    }

    return { isOverbooked: false };
  }

  async exportData(): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    const reservations = await this.db.getAllAsync(
      'SELECT * FROM reservations ORDER BY created_at'
    );
    const settings = await this.db.getFirstAsync(
      'SELECT * FROM settings WHERE id = 1'
    );
    const clientNames = await this.db.getAllAsync(
      'SELECT * FROM client_names ORDER BY usage_count DESC'
    );
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      reservations,
      settings,
      client_names: clientNames,
    };
    return JSON.stringify(exportData, null, 2);
  }

  async importData(
    jsonData: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      const data = JSON.parse(jsonData);
      if (!data.reservations || !Array.isArray(data.reservations)) {
        return { success: false, message: 'Invalid data format' };
      }
      await this.db.execAsync('DELETE FROM reservations');
      await this.db.execAsync('DELETE FROM client_names');
      for (const reservation of data.reservations) {
        await this.db.runAsync(
          `
          INSERT INTO reservations
          (name, date, nb_people, single_canoes, double_canoes, arrival_time, timeslot, status, created_at, updated_at, actual_arrival_time, departure_time, return_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            reservation.name,
            reservation.date,
            reservation.nb_people,
            reservation.single_canoes,
            reservation.double_canoes,
            reservation.arrival_time,
            reservation.timeslot,
            reservation.status,
            reservation.created_at,
            reservation.updated_at,
            reservation.actual_arrival_time,
            reservation.departure_time,
            reservation.return_time,
          ]
        );
      }
      if (data.client_names && Array.isArray(data.client_names)) {
        for (const client of data.client_names) {
          await this.db.runAsync(
            `
            INSERT INTO client_names (name, usage_count, last_used)
            VALUES (?, ?, ?)
          `,
            [client.name, client.usage_count, client.last_used]
          );
        }
      }
      if (data.settings) {
        await this.updateSettings({
          total_single_canoes: data.settings.total_single_canoes,
          total_double_canoes: data.settings.total_double_canoes,
        });
      }
      return { success: true, message: 'Data imported successfully' };
    } catch (error) {
      console.error('Import error:', error);
      return {
        success: false,
        message: 'Failed to import data: Invalid format',
      };
    }
  }

  async createBackup(): Promise<string> {
    const data = await this.exportData();
    await this.updateSettings({ last_backup_date: new Date().toISOString() });
    return data;
  }

  // Nouvelle méthode pour analyser les anomalies temporelles
  async analyzeReservationTimeAlerts(
    reservations: Reservation[],
    currentDate: string
  ): Promise<
    Array<{
      id: number;
      alertType: 'early_afternoon' | 'overtime_morning' | 'wrong_timeslot';
      message: string;
      severity: 'warning' | 'error';
    }>
  > {
    if (!this.db) throw new Error('Database not initialized');

    const settings = await this.getSettings();
    const now = new Date();
    const alerts: Array<{
      id: number;
      alertType: 'early_afternoon' | 'overtime_morning' | 'wrong_timeslot';
      message: string;
      severity: 'warning' | 'error';
    }> = [];

    // Créer les heures de référence pour aujourd'hui
    const today = format(now, 'yyyy-MM-dd');
    const morningEnd = new Date(
      `${today}T${settings.morning_end_time || '13:00'}:00`
    );
    const afternoonStart = new Date(
      `${today}T${settings.afternoon_start_time || '14:00'}:00`
    );

    for (const reservation of reservations) {
      // Ne vérifier que les réservations sur l'eau du jour actuel
      if (
        reservation.status !== 'on_water' ||
        reservation.date !== currentDate
      ) {
        continue;
      }

      // Cas 1: Réservation après-midi qui est sur l'eau trop tôt
      if (reservation.timeslot === 'afternoon' && now < afternoonStart) {
        const minutesEarly = Math.floor(
          (afternoonStart.getTime() - now.getTime()) / (1000 * 60)
        );
        alerts.push({
          id: reservation.id!,
          alertType: 'early_afternoon',
          message: `Sur l'eau ${minutesEarly}min avant l'heure (après-midi commence à ${settings.afternoon_start_time})`,
          severity: 'warning',
        });
      }

      // Cas 2: Réservation matin qui est encore sur l'eau après l'heure limite
      if (reservation.timeslot === 'morning' && now > morningEnd) {
        const minutesOvertime = Math.floor(
          (now.getTime() - morningEnd.getTime()) / (1000 * 60)
        );
        alerts.push({
          id: reservation.id!,
          alertType: 'overtime_morning',
          message: `Dépassement de ${minutesOvertime}min (matin se termine à ${settings.morning_end_time})`,
          severity: minutesOvertime > 60 ? 'error' : 'warning',
        });
      }

      // Cas 3: Vérification générale - réservation sur l'eau en dehors de son créneau
      if (
        reservation.timeslot === 'morning' &&
        (now <
          new Date(`${today}T${settings.morning_start_time || '09:00'}:00`) ||
          now > morningEnd)
      ) {
        // Déjà géré par le cas 2 pour les dépassements
      } else if (
        reservation.timeslot === 'afternoon' &&
        (now < afternoonStart ||
          now >
            new Date(`${today}T${settings.afternoon_end_time || '18:00'}:00`))
      ) {
        // Déjà géré par le cas 1 pour les départs trop tôts
        if (
          now >
          new Date(`${today}T${settings.afternoon_end_time || '18:00'}:00`)
        ) {
          const minutesOvertime = Math.floor(
            (now.getTime() -
              new Date(
                `${today}T${settings.afternoon_end_time || '18:00'}:00`
              ).getTime()) /
              (1000 * 60)
          );
          alerts.push({
            id: reservation.id!,
            alertType: 'wrong_timeslot',
            message: `Dépassement après-midi de ${minutesOvertime}min (se termine à ${settings.afternoon_end_time})`,
            severity: minutesOvertime > 30 ? 'error' : 'warning',
          });
        }
      }
    }

    return alerts;
  }

  // Méthode pour obtenir les réservations avec alertes intégrées
  async getReservationsWithTimeAlerts(date?: string): Promise<
    Array<
      Reservation & {
        timeAlert?: {
          type: 'early_afternoon' | 'overtime_morning' | 'wrong_timeslot';
          message: string;
          severity: 'warning' | 'error';
        };
        isLate?: boolean;
        lateMinutes?: number;
      }
    >
  > {
    if (!this.db) throw new Error('Database not initialized');

    const reservations = await this.getReservations(date);
    const currentDate = date || format(new Date(), 'yyyy-MM-dd');
    const alerts = await this.analyzeReservationTimeAlerts(
      reservations,
      currentDate
    );

    // Ajouter aussi la détection de retard classique
    const now = new Date();

    return reservations.map((reservation) => {
      const alert = alerts.find((a) => a.id === reservation.id);

      // Calculer le retard classique (pour les réservations en attente)
      let isLate = false;
      let lateMinutes = 0;

      if (
        reservation.status === 'pending' &&
        reservation.date === format(now, 'yyyy-MM-dd')
      ) {
        const expectedTime = new Date(
          `${reservation.date}T${reservation.arrival_time}:00`
        );
        isLate = now > expectedTime;
        lateMinutes = isLate
          ? Math.floor((now.getTime() - expectedTime.getTime()) / (1000 * 60))
          : 0;
      }

      return {
        ...reservation,
        timeAlert: alert
          ? {
              type: alert.alertType,
              message: alert.message,
              severity: alert.severity,
            }
          : undefined,
        isLate,
        lateMinutes,
      };
    });
  }

  suggestCanoeAllocation(people: number): { single: number; double: number } {
    if (people <= 0) return { single: 0, double: 0 };
    const doubleCanoes = Math.floor(people / 2);
    const singleCanoes = people % 2;
    return { single: singleCanoes, double: doubleCanoes };
  }
}
