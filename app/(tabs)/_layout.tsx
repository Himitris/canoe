import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          height: 65,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
      }}
    >
      {/* Tableau de bord principal - fusionnant accueil, réservations et suivi */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tableau de Bord',
          tabBarIcon: ({ size, color }) => (
            <MaterialCommunityIcons
              name="view-dashboard"
              size={size}
              color={color}
            />
          ),
        }}
      />
      {/* Nouvelle page de gestion des réservations style Excel */}
      <Tabs.Screen
        name="reservations"
        options={{
          title: 'Réservations',
          tabBarIcon: ({ size, color }) => (
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* Ajouter une réservation */}
      <Tabs.Screen
        name="add-reservation"
        options={{
          title: 'Nouvelle Résa',
          tabBarIcon: ({ size, color }) => (
            <MaterialCommunityIcons
              name="plus-circle"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* Statistiques et rapports */}
      <Tabs.Screen
        name="statistics"
        options={{
          title: 'Statistiques',
          tabBarIcon: ({ size, color }) => (
            <MaterialCommunityIcons
              name="chart-line"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* Paramètres */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
          tabBarIcon: ({ size, color }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
