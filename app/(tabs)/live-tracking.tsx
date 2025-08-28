import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import {
  Text,
  Chip,
  FAB,
  useTheme,
  IconButton,
  Searchbar,
  Surface,
  TouchableRipple,
  Divider,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  format,
  addDays,
  isAfter,
  parseISO,
  differenceInMinutes,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { Reservation } from '../../services/DatabaseService';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface ReservationWithStatus extends Reservation {
  isLate?: boolean;
  lateMinutes?: number;
}

const { width } = Dimensions.get('window');
const ITEMS_PER_PAGE = 100;

export default function LiveTracking() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const router = useRouter();
  const [allReservations, setAllReservations] = useState<
    ReservationWithStatus[]
  >([]);
  const [filteredReservations, setFilteredReservations] = useState<
    ReservationWithStatus[]
  >([]);
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadReservations = async () => {
    if (!db) return;
    try {
      const reservations = await db.getReservations(selectedDate);
      const reservationsWithStatus = reservations.map((reservation) => {
        const now = new Date();
        const expectedTime = parseISO(
          `${reservation.date}T${reservation.arrival_time}:00`
        );
        const isLate =
          reservation.status === 'pending' && isAfter(now, expectedTime);
        const lateMinutes = isLate ? differenceInMinutes(now, expectedTime) : 0;

        return { ...reservation, isLate, lateMinutes } as ReservationWithStatus;
      });

      setAllReservations(reservationsWithStatus);
      filterReservations(reservationsWithStatus, selectedStatus, searchQuery);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    }
  };

  const filterReservations = (
    reservations: ReservationWithStatus[],
    status: string,
    search: string
  ) => {
    let filtered = [...reservations];

    if (status !== 'all') {
      if (status === 'late') {
        filtered = filtered.filter((r) => r.isLate);
      } else {
        filtered = filtered.filter((r) => r.status === status);
      }
    }

    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.name.toLowerCase().includes(searchLower)
      );
    }

    // Tri : retards en premier, puis par heure
    filtered.sort((a, b) => {
      if (a.isLate && !b.isLate) return -1;
      if (!a.isLate && b.isLate) return 1;
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return a.arrival_time.localeCompare(b.arrival_time);
    });

    setFilteredReservations(filtered);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReservations();
    setRefreshing(false);
  }, [selectedDate, db]);

  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadReservations();
      }
    }, [selectedDate, isReady, db])
  );

  const handleStatusChange = async (
    id: number,
    newStatus: 'on_water' | 'completed'
  ) => {
    if (!db) return;
    try {
      if (newStatus === 'on_water') {
        await db.markReservationOnWater(id);
      } else if (newStatus === 'completed') {
        await db.markReservationCompleted(id);
      }
      await loadReservations();
    } catch (error) {
      console.error('Erreur lors du changement de statut:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
    }
  };

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status);
    filterReservations(allReservations, status, searchQuery);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    filterReservations(allReservations, selectedStatus, query);
  };

  const getStatusCounts = () => {
    return {
      all: allReservations.length,
      pending: allReservations.filter((r) => r.status === 'pending').length,
      on_water: allReservations.filter((r) => r.status === 'on_water').length,
      completed: allReservations.filter((r) => r.status === 'completed').length,
      late: allReservations.filter((r) => r.isLate).length,
    };
  };

  const getDurationOnWater = (item: ReservationWithStatus) => {
    if (!item.departure_time) return null;
    const departure = new Date(item.departure_time);
    const now = item.return_time ? new Date(item.return_time) : new Date();
    const diffMinutes = Math.floor(
      (now.getTime() - departure.getTime()) / (1000 * 60)
    );

    if (diffMinutes < 60) return `${diffMinutes}m`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}`;
  };

  const renderReservationItem = ({
    item,
    index,
  }: {
    item: ReservationWithStatus;
    index: number;
  }) => {
    const isEven = index % 2 === 0;

    const getStatusInfo = () => {
      if (item.isLate) {
        return {
          color: '#D32F2F',
          bgColor: '#FFCDD2',
          icon: 'alert-circle',
          text: `RETARD ${item.lateMinutes}min`,
          textColor: '#D32F2F',
        };
      }

      switch (item.status) {
        case 'pending':
          return {
            color: '#F57C00',
            bgColor: '#FFE0B2',
            icon: 'clock-outline',
            text: 'EN ATTENTE',
            textColor: '#E65100',
          };
        case 'on_water':
          return {
            color: '#388E3C',
            bgColor: '#C8E6C9',
            icon: 'sail-boat',
            text: "SUR L'EAU",
            textColor: '#2E7D32',
          };
        case 'completed':
          return {
            color: '#616161',
            bgColor: '#E0E0E0',
            icon: 'check-circle',
            text: 'TERMINÉ',
            textColor: '#424242',
          };
        default:
          return {
            color: '#757575',
            bgColor: '#F5F5F5',
            icon: 'help-circle',
            text: 'INCONNU',
            textColor: '#616161',
          };
      }
    };

    const statusInfo = getStatusInfo();
    const duration = getDurationOnWater(item);

    return (
      <TouchableRipple
        onPress={() => {}}
        style={[
          styles.itemTouchable,
          { backgroundColor: isEven ? '#FAFAFA' : 'white' },
        ]}
      >
        <View style={styles.itemContainer}>
          {/* Indicateur coloré à gauche */}
          <View
            style={[styles.statusBar, { backgroundColor: statusInfo.color }]}
          />

          {/* Contenu principal */}
          <View style={styles.contentContainer}>
            {/* Ligne principale */}
            <View style={styles.mainRow}>
              {/* Info client */}
              <View style={styles.clientSection}>
                <Text style={styles.clientName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.timeText}>{item.arrival_time}</Text>
              </View>

              {/* Détails */}
              <View style={styles.detailsSection}>
                <Text style={styles.peopleText}>{item.nb_people}p</Text>
                <Text style={styles.canoeText}>
                  {item.single_canoes}S+{item.double_canoes}D
                </Text>
                <Text style={styles.slotText}>
                  {item.timeslot === 'morning'
                    ? 'MAT'
                    : item.timeslot === 'afternoon'
                    ? 'APM'
                    : 'J'}
                </Text>
                {duration && (
                  <Text
                    style={[styles.durationText, { color: statusInfo.color }]}
                  >
                    {duration}
                  </Text>
                )}
              </View>

              {/* Statut */}
              <View style={styles.statusSection}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusInfo.bgColor },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={statusInfo.icon as any}
                    size={14}
                    color={statusInfo.textColor}
                  />
                  <Text
                    style={[styles.statusText, { color: statusInfo.textColor }]}
                  >
                    {statusInfo.text}
                  </Text>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.actionSection}>
                {item.status === 'pending' && (
                  <TouchableRipple
                    onPress={() => handleStatusChange(item.id!, 'on_water')}
                    style={[
                      styles.actionButton,
                      { backgroundColor: '#388E3C' },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="sail-boat"
                      size={18}
                      color="white"
                    />
                  </TouchableRipple>
                )}

                {item.status === 'on_water' && (
                  <TouchableRipple
                    onPress={() => handleStatusChange(item.id!, 'completed')}
                    style={[
                      styles.actionButton,
                      { backgroundColor: '#616161' },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color="white"
                    />
                  </TouchableRipple>
                )}

                {(item.status === 'completed' ||
                  item.status === 'canceled') && (
                  <View style={styles.actionPlaceholder} />
                )}
              </View>
            </View>
          </View>
        </View>
      </TouchableRipple>
    );
  };

  const getDateChips = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(new Date(), i);
      dates.push({
        label:
          i === 0
            ? "AUJOURD'HUI"
            : i === 1
            ? 'DEMAIN'
            : format(date, 'dd MMM', { locale: fr }).toUpperCase(),
        value: format(date, 'yyyy-MM-dd'),
      });
    }
    return dates;
  };

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  const statusCounts = getStatusCounts();

  return (
    <View style={styles.container}>
      {/* En-tête fixe */}
      <Surface style={styles.header} elevation={4}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>SUIVI LIVE</Text>
            <Text style={styles.headerDate}>
              {format(new Date(selectedDate), 'EEEE dd MMMM', {
                locale: fr,
              }).toUpperCase()}
            </Text>
          </View>
          <IconButton
            icon="refresh"
            size={26}
            iconColor="#1976D2"
            style={styles.refreshButton}
            onPress={onRefresh}
          />
        </View>

        {/* Métriques rapides */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricNumber}>{statusCounts.all}</Text>
            <Text style={styles.metricLabel}>TOTAL</Text>
          </View>
          <Divider style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text
              style={[
                styles.metricNumber,
                { color: statusCounts.late > 0 ? '#D32F2F' : '#757575' },
              ]}
            >
              {statusCounts.late}
            </Text>
            <Text style={styles.metricLabel}>RETARDS</Text>
          </View>
          <Divider style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={[styles.metricNumber, { color: '#388E3C' }]}>
              {statusCounts.on_water}
            </Text>
            <Text style={styles.metricLabel}>SUR L'EAU</Text>
          </View>
          <Divider style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={[styles.metricNumber, { color: '#F57C00' }]}>
              {statusCounts.pending}
            </Text>
            <Text style={styles.metricLabel}>ATTENTE</Text>
          </View>
        </View>
      </Surface>

      {/* Contrôles */}
      <View style={styles.controlsContainer}>
        {/* Recherche */}
        <Searchbar
          placeholder="Rechercher un client..."
          onChangeText={handleSearch}
          value={searchQuery}
          style={styles.searchbar}
          inputStyle={styles.searchInput}
          iconColor="#1976D2"
        />

        {/* Dates */}
        <View style={styles.dateRow}>
          {getDateChips().map((dateItem) => (
            <Chip
              key={dateItem.value}
              selected={selectedDate === dateItem.value}
              onPress={() => setSelectedDate(dateItem.value)}
              compact
              style={[
                styles.dateChip,
                selectedDate === dateItem.value
                  ? styles.selectedDateChip
                  : styles.unselectedDateChip,
              ]}
              textStyle={[
                styles.dateChipText,
                selectedDate === dateItem.value
                  ? styles.selectedDateChipText
                  : styles.unselectedDateChipText,
              ]}
            >
              {dateItem.label}
            </Chip>
          ))}
        </View>

        {/* Filtres de statut */}
        <View style={styles.filtersRow}>
          {[
            {
              key: 'all',
              label: 'TOUTES',
              count: statusCounts.all,
              color: '#1976D2',
            },
            {
              key: 'late',
              label: 'RETARDS',
              count: statusCounts.late,
              color: '#D32F2F',
            },
            {
              key: 'pending',
              label: 'ATTENTE',
              count: statusCounts.pending,
              color: '#F57C00',
            },
            {
              key: 'on_water',
              label: "SUR L'EAU",
              count: statusCounts.on_water,
              color: '#388E3C',
            },
            {
              key: 'completed',
              label: 'TERMINÉ',
              count: statusCounts.completed,
              color: '#616161',
            },
          ].map((filter) => (
            <Chip
              key={filter.key}
              selected={selectedStatus === filter.key}
              onPress={() => handleStatusFilter(filter.key)}
              compact
              style={[
                styles.filterChip,
                selectedStatus === filter.key && {
                  backgroundColor: filter.color,
                },
              ]}
              textStyle={[
                styles.filterChipText,
                selectedStatus === filter.key && { color: 'white' },
              ]}
            >
              {filter.label} ({filter.count})
            </Chip>
          ))}
        </View>
      </View>

      {/* Liste */}
      <FlatList
        data={filteredReservations.slice(0, ITEMS_PER_PAGE)}
        renderItem={renderReservationItem}
        keyExtractor={(item) => item.id!.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={25}
        windowSize={10}
        initialNumToRender={20}
        getItemLayout={(data, index) => ({
          length: 60,
          offset: 60 * index,
          index,
        })}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="calendar-blank"
              size={64}
              color="#BDBDBD"
            />
            <Text style={styles.emptyTitle}>Aucune réservation</Text>
            <Text style={styles.emptyText}>
              {searchQuery || selectedStatus !== 'all'
                ? 'Aucune réservation correspondante'
                : "Aucune réservation aujourd'hui"}
            </Text>
          </View>
        )}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/add-reservation')}
        size="medium"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1976D2',
    letterSpacing: 0.5,
  },
  headerDate: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
    fontWeight: '500',
  },
  refreshButton: {
    margin: 0,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1976D2',
  },
  metricLabel: {
    fontSize: 10,
    color: '#757575',
    fontWeight: '600',
    marginTop: 2,
  },
  metricDivider: {
    height: 30,
    width: 1,
  },
  controlsContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingBottom: 12,
    elevation: 2,
  },
  searchbar: {
    backgroundColor: '#F8F9FA',
    elevation: 0,
    marginBottom: 12,
  },
  searchInput: {
    fontSize: 14,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  dateChip: {
    flex: 1,
    height: 32,
  },
  selectedDateChip: {
    backgroundColor: '#1976D2',
  },
  unselectedDateChip: {
    backgroundColor: '#F8F9FA',
  },
  dateChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  selectedDateChipText: {
    color: 'white',
  },
  unselectedDateChipText: {
    color: '#757575',
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    backgroundColor: '#F8F9FA',
    height: 32,
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#757575',
  },
  list: {
    flex: 1,
  },
  itemTouchable: {
    marginHorizontal: 0,
    marginVertical: 0,
  },
  itemContainer: {
    flexDirection: 'row',
    height: 60,
    alignItems: 'center',
  },
  statusBar: {
    width: 4,
    height: '100%',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  clientSection: {
    flex: 2,
    minWidth: 100,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 2,
  },
  timeText: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '600',
  },
  detailsSection: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  peopleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1976D2',
    minWidth: 20,
  },
  canoeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    minWidth: 35,
  },
  slotText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9E9E9E',
    minWidth: 25,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusSection: {
    flex: 2,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  actionSection: {
    flex: 1,
    alignItems: 'center',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  actionPlaceholder: {
    width: 36,
    height: 36,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#757575',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#1976D2',
  },
});
