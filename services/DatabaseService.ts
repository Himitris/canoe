import * as SQLite from 'expo-sqlite';

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
        'INSERT INTO settings (total_single_canoes, total_double_canoes, auto_backup_enabled) VALUES (?, ?, ?)',
        [10, 5, 1]
      );
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
    const activeReservations = reservations.filter(
      (r) => r.status === 'pending' || r.status === 'on_water'
    );
    let morningUsed = { single: 0, double: 0 };
    let afternoonUsed = { single: 0, double: 0 };
    activeReservations.forEach((reservation) => {
      if (reservation.timeslot === 'morning') {
        morningUsed.single += reservation.single_canoes;
        morningUsed.double += reservation.double_canoes;
      } else if (reservation.timeslot === 'afternoon') {
        afternoonUsed.single += reservation.single_canoes;
        afternoonUsed.double += reservation.double_canoes;
      } else if (reservation.timeslot === 'full_day') {
        morningUsed.single += reservation.single_canoes;
        morningUsed.double += reservation.double_canoes;
        afternoonUsed.single += reservation.single_canoes;
        afternoonUsed.double += reservation.double_canoes;
      }
    });
    return {
      morning: {
        single: Math.max(0, settings.total_single_canoes - morningUsed.single),
        double: Math.max(0, settings.total_double_canoes - morningUsed.double),
        total_single: settings.total_single_canoes,
        total_double: settings.total_double_canoes,
      },
      afternoon: {
        single: Math.max(
          0,
          settings.total_single_canoes - afternoonUsed.single
        ),
        double: Math.max(
          0,
          settings.total_double_canoes - afternoonUsed.double
        ),
        total_single: settings.total_single_canoes,
        total_double: settings.total_double_canoes,
      },
      full_day: {
        single: Math.max(
          0,
          Math.min(
            settings.total_single_canoes - morningUsed.single,
            settings.total_single_canoes - afternoonUsed.single
          )
        ),
        double: Math.max(
          0,
          Math.min(
            settings.total_double_canoes - morningUsed.double,
            settings.total_double_canoes - afternoonUsed.double
          )
        ),
        total_single: settings.total_single_canoes,
        total_double: settings.total_double_canoes,
      },
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
    if (excludeId) {
      const currentReservation = await this.getReservation(excludeId);
      if (
        currentReservation &&
        currentReservation.date === date &&
        currentReservation.timeslot === timeslot
      ) {
        availableSlot.single += currentReservation.single_canoes;
        availableSlot.double += currentReservation.double_canoes;
      }
    }
    const singleOverbook = singleCanoes > availableSlot.single;
    const doubleOverbook = doubleCanoes > availableSlot.double;
    if (singleOverbook || doubleOverbook) {
      let message = 'Overbooking detected: ';
      const issues = [];
      if (singleOverbook) {
        issues.push(
          `${singleCanoes - availableSlot.single} extra single canoe(s)`
        );
      }
      if (doubleOverbook) {
        issues.push(
          `${doubleCanoes - availableSlot.double} extra double canoe(s)`
        );
      }
      message += issues.join(', ');
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

  suggestCanoeAllocation(people: number): { single: number; double: number } {
    if (people <= 0) return { single: 0, double: 0 };
    const doubleCanoes = Math.floor(people / 2);
    const singleCanoes = people % 2;
    return { single: singleCanoes, double: doubleCanoes };
  }
}
