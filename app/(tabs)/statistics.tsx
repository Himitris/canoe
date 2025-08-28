import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card, Title, Text, useTheme, ProgressBar, Chip } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { format, subDays, addDays } from 'date-fns';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { DailyStats } from '../../services/DatabaseService';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function Statistics() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month'>('week');
  const [loading, setLoading] = useState(false);

  const loadStatistics = async () => {
    if (!db) return;

    setLoading(true);
    try {
      const stats: DailyStats[] = [];
      const days = selectedPeriod === 'week' ? 7 : 30;
      
      for (let i = days - 1; i >= 0; i--) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
        const dayStats = await db.getDailyStats(date);
        stats.push(dayStats);
      }
      
      setDailyStats(stats);
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadStatistics();
      }
    }, [isReady, db, selectedPeriod])
  );

  const getTotalStats = () => {
    return dailyStats.reduce(
      (totals, day) => ({
        reservations: totals.reservations + day.total_reservations,
        people: totals.people + day.total_people,
        avgOccupancy: totals.avgOccupancy + (day.morning_occupancy + day.afternoon_occupancy) / 2,
      }),
      { reservations: 0, people: 0, avgOccupancy: 0 }
    );
  };

  const getBusiestDay = () => {
    return dailyStats.reduce((busiest, day) => 
      day.total_people > busiest.total_people ? day : busiest,
      dailyStats[0] || { date: '', total_people: 0 }
    );
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const totalStats = getTotalStats();
  const busiestDay = getBusiestDay();
  const avgOccupancy = dailyStats.length > 0 ? totalStats.avgOccupancy / dailyStats.length : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Title style={styles.headerTitle}>Statistics</Title>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          Business insights and performance metrics
        </Text>
      </View>

      <View style={styles.periodSelector}>
        <Chip
          selected={selectedPeriod === 'week'}
          onPress={() => setSelectedPeriod('week')}
          style={[
            styles.periodChip,
            selectedPeriod === 'week' && { backgroundColor: theme.colors.primary },
          ]}
          textStyle={[
            selectedPeriod === 'week' && { color: 'white' },
          ]}
        >
          Last 7 Days
        </Chip>
        <Chip
          selected={selectedPeriod === 'month'}
          onPress={() => setSelectedPeriod('month')}
          style={[
            styles.periodChip,
            selectedPeriod === 'month' && { backgroundColor: theme.colors.primary },
          ]}
          textStyle={[
            selectedPeriod === 'month' && { color: 'white' },
          ]}
        >
          Last 30 Days
        </Chip>
      </View>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.summaryHeader}>
            <MaterialCommunityIcons
              name="chart-box"
              size={20}
              color={theme.colors.primary}
            />
            <Text variant="titleMedium" style={styles.cardTitle}>
              Summary
            </Text>
          </View>
          
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text variant="headlineLarge" style={styles.summaryNumber}>
                {totalStats.reservations}
              </Text>
              <Text variant="labelMedium" style={styles.summaryLabel}>
                Total Reservations
              </Text>
            </View>
            
            <View style={styles.summaryItem}>
              <Text variant="headlineLarge" style={styles.summaryNumber}>
                {totalStats.people}
              </Text>
              <Text variant="labelMedium" style={styles.summaryLabel}>
                Total People
              </Text>
            </View>
            
            <View style={styles.summaryItem}>
              <Text variant="headlineLarge" style={styles.summaryNumber}>
                {avgOccupancy.toFixed(0)}%
              </Text>
              <Text variant="labelMedium" style={styles.summaryLabel}>
                Avg Occupancy
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {busiestDay && (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <View style={styles.summaryHeader}>
              <MaterialCommunityIcons
                name="trophy"
                size={20}
                color={theme.colors.warning}
              />
              <Text variant="titleMedium" style={styles.cardTitle}>
                Busiest Day
              </Text>
            </View>
            
            <View style={styles.busiestDayContent}>
              <Text variant="headlineSmall" style={styles.busiestDayDate}>
                {format(new Date(busiestDay.date), 'MMM dd, yyyy')}
              </Text>
              <Text variant="bodyLarge" style={styles.busiestDayStats}>
                {busiestDay.total_people} people • {busiestDay.total_reservations} reservations
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.summaryHeader}>
            <MaterialCommunityIcons
              name="chart-timeline-variant"
              size={20}
              color={theme.colors.primary}
            />
            <Text variant="titleMedium" style={styles.cardTitle}>
              Daily Breakdown
            </Text>
          </View>
          
          <View style={styles.dailyList}>
            {dailyStats.slice(-7).map((day) => (
              <View key={day.date} style={styles.dailyItem}>
                <View style={styles.dailyHeader}>
                  <Text variant="bodyLarge" style={styles.dailyDate}>
                    {format(new Date(day.date), 'MMM dd')}
                  </Text>
                  <Text variant="bodyMedium" style={styles.dailyPeople}>
                    {day.total_people} people
                  </Text>
                </View>
                
                <View style={styles.occupancyBars}>
                  <View style={styles.occupancyItem}>
                    <Text variant="labelSmall" style={styles.occupancyLabel}>
                      Morning
                    </Text>
                    <ProgressBar
                      progress={day.morning_occupancy / 100}
                      color={theme.colors.primary}
                      style={styles.occupancyBar}
                    />
                    <Text variant="labelSmall" style={styles.occupancyPercent}>
                      {day.morning_occupancy.toFixed(0)}%
                    </Text>
                  </View>
                  
                  <View style={styles.occupancyItem}>
                    <Text variant="labelSmall" style={styles.occupancyLabel}>
                      Afternoon
                    </Text>
                    <ProgressBar
                      progress={day.afternoon_occupancy / 100}
                      color={theme.colors.secondary}
                      style={styles.occupancyBar}
                    />
                    <Text variant="labelSmall" style={styles.occupancyPercent}>
                      {day.afternoon_occupancy.toFixed(0)}%
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  headerSubtitle: {
    color: '#666',
    marginTop: 4,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodChip: {
    flex: 1,
  },
  card: {
    marginBottom: 16,
    backgroundColor: 'white',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  cardTitle: {
    fontWeight: '600',
    color: '#1976D2',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryNumber: {
    fontWeight: 'bold',
    color: '#1976D2',
  },
  summaryLabel: {
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  busiestDayContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  busiestDayDate: {
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 4,
  },
  busiestDayStats: {
    color: '#666',
  },
  dailyList: {
    gap: 16,
  },
  dailyItem: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
  },
  dailyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dailyDate: {
    fontWeight: '600',
  },
  dailyPeople: {
    color: '#666',
  },
  occupancyBars: {
    gap: 8,
  },
  occupancyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  occupancyLabel: {
    minWidth: 60,
    color: '#666',
  },
  occupancyBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  occupancyPercent: {
    minWidth: 35,
    textAlign: 'right',
    fontWeight: '500',
  },
});