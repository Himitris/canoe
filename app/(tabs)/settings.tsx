import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import {
  Card,
  Title,
  Text,
  TextInput,
  Button,
  useTheme,
  Switch,
  Divider,
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDatabase } from '../../components/database/DatabaseProvider';
import { Settings } from '../../services/DatabaseService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function SettingsScreen() {
  const { db, isReady } = useDatabase();
  const theme = useTheme();
  const [settings, setSettings] = useState<Settings>({
    total_single_canoes: 10,
    total_double_canoes: 5,
    auto_backup_enabled: true,
    morning_start_time: '09:00',
    morning_end_time: '13:00',
    afternoon_start_time: '14:00',
    afternoon_end_time: '18:00',
  });
  const [tempSettings, setTempSettings] = useState<Settings>({
    total_single_canoes: 10,
    total_double_canoes: 5,
    auto_backup_enabled: true,
    morning_start_time: '09:00',
    morning_end_time: '13:00',
    afternoon_start_time: '14:00',
    afternoon_end_time: '18:00',
  });
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const loadSettings = async () => {
    if (!db) return;

    try {
      const data = await db.getSettings();
      setSettings(data);
      setTempSettings(data);
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadSettings();
      }
    }, [isReady, db])
  );

  const validateTimeFormat = (time: string): boolean => {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  };

  const validateTimeSchedule = (settings: Settings): { isValid: boolean; message?: string } => {
    // Vérifier le format des heures
    const times = [
      settings.morning_start_time,
      settings.morning_end_time,
      settings.afternoon_start_time,
      settings.afternoon_end_time,
    ];

    for (const time of times) {
      if (time && !validateTimeFormat(time)) {
        return { isValid: false, message: `Format d'heure invalide: ${time}. Utilisez le format HH:MM` };
      }
    }

    // Vérifier la logique des créneaux
    const morningStart = new Date(`2000-01-01T${settings.morning_start_time || '09:00'}:00`);
    const morningEnd = new Date(`2000-01-01T${settings.morning_end_time || '13:00'}:00`);
    const afternoonStart = new Date(`2000-01-01T${settings.afternoon_start_time || '14:00'}:00`);
    const afternoonEnd = new Date(`2000-01-01T${settings.afternoon_end_time || '18:00'}:00`);

    if (morningStart >= morningEnd) {
      return { isValid: false, message: 'L\'heure de fin du matin doit être après l\'heure de début' };
    }

    if (afternoonStart >= afternoonEnd) {
      return { isValid: false, message: 'L\'heure de fin de l\'après-midi doit être après l\'heure de début' };
    }

    if (morningEnd > afternoonStart) {
      return { isValid: false, message: 'Il doit y avoir un écart entre la fin du matin et le début de l\'après-midi' };
    }

    return { isValid: true };
  };

  const handleSave = async () => {
    if (!db) return;

    if (
      tempSettings.total_single_canoes < 0 ||
      tempSettings.total_double_canoes < 0
    ) {
      Alert.alert('Erreur', 'Le nombre de canoës ne peut pas être négatif');
      return;
    }

    if (
      tempSettings.total_single_canoes === 0 &&
      tempSettings.total_double_canoes === 0
    ) {
      Alert.alert('Erreur', 'Vous devez avoir au moins un canoë disponible');
      return;
    }

    // Validation des horaires
    const timeValidation = validateTimeSchedule(tempSettings);
    if (!timeValidation.isValid) {
      Alert.alert('Erreur de planning', timeValidation.message);
      return;
    }

    setLoading(true);
    try {
      await db.updateSettings(tempSettings);
      setSettings(tempSettings);
      Alert.alert('Succès', 'Paramètres sauvegardés avec succès !');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      Alert.alert('Erreur', 'Échec de la sauvegarde. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTempSettings(settings);
  };

  const handleExportData = async () => {
    if (!db) return;

    setBackupLoading(true);
    try {
      const data = await db.createBackup();
      const fileName = `sauvegarde_canoe_${format(
        new Date(),
        'yyyy-MM-dd_HH-mm'
      )}.json`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, data);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Exporter les données de location de canoës',
        });
      } else {
        Alert.alert('Succès', `Données exportées vers ${fileName}`);
      }
    } catch (error) {
      console.error("Erreur lors de l'export:", error);
      Alert.alert('Erreur', "Échec de l'export. Veuillez réessayer.");
    } finally {
      setBackupLoading(false);
    }
  };

  const handleGenerateTestData = async () => {
    if (!db) return;

    Alert.alert(
      'Générer des données de test',
      'Ceci va créer 50 réservations factices avec différents statuts et horaires. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Générer',
          style: 'default',
          onPress: async () => {
            setBackupLoading(true);
            try {
              await generateTestReservations();
              Alert.alert('Succès', '50 réservations de test créées avec succès !');
            } catch (error) {
              console.error('Erreur lors de la génération:', error);
              Alert.alert('Erreur', 'Échec de la génération des données de test.');
            } finally {
              setBackupLoading(false);
            }
          },
        },
      ]
    );
  };

const generateTestReservations = async () => {
  if (!db) return;

  const clientNames = [
    'Martin Dubois',
    'Sophie Legrand',
    'Jean Moreau',
    'Marie Durand',
    'Pierre Laurent',
    'Julie Bernard',
    'Thomas Petit',
    'Claire Rousseau',
    'Nicolas Faure',
    'Camille Michel',
    'Julien Leroy',
    'Emma Fournier',
    'Alexandre Girard',
    'Léa Bonnet',
    'Maxime Dupont',
    'Chloé Lambert',
    'Antoine Fontaine',
    'Sarah Leclerc',
    'Romain Blanc',
    'Manon Guerin',
    'Lucas Joly',
    'Océane Chevalier',
    'Hugo Francois',
    'Inès Gauthier',
    'Gabriel Muller',
    'Famille Johnson',
    'Groupe Aventure',
    'Club Nautique',
    'École Saint-Jean',
    'Association Loisirs',
  ];

  const statuses: Array<'pending' | 'on_water' | 'completed' | 'canceled'> = [
    'pending',
    'on_water',
    'completed',
    'canceled',
  ];

  const timeslots: Array<'morning' | 'afternoon' | 'full_day'> = [
    'morning',
    'afternoon',
    'full_day',
  ];

  const today = new Date();
  for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + dayOffset);
    const dateStr = format(currentDate, 'yyyy-MM-dd');

    const reservationsPerDay = 12 + Math.floor(Math.random() * 4);

    for (let i = 0; i < reservationsPerDay; i++) {
      const clientName =
        clientNames[Math.floor(Math.random() * clientNames.length)];
      const nbPeople = 1 + Math.floor(Math.random() * 8);
      const timeslot = timeslots[Math.floor(Math.random() * timeslots.length)];
      const canoeAllocation = db.suggestCanoeAllocation(nbPeople);
      const singleCanoes = Math.max(
        0,
        canoeAllocation.single +
          (Math.random() < 0.3 ? Math.floor(Math.random() * 2) - 1 : 0)
      );
      const doubleCanoes = Math.max(
        0,
        canoeAllocation.double +
          (Math.random() < 0.3 ? Math.floor(Math.random() * 2) - 1 : 0)
      );

      let arrivalTime: string;
      if (timeslot === 'morning') {
        const hour = 8 + Math.floor(Math.random() * 3);
        const minute = Math.floor(Math.random() * 4) * 15;
        arrivalTime = `${hour.toString().padStart(2, '0')}:${minute
          .toString()
          .padStart(2, '0')}`;
      } else if (timeslot === 'afternoon') {
        const hour = 13 + Math.floor(Math.random() * 3);
        const minute = Math.floor(Math.random() * 4) * 15;
        arrivalTime = `${hour.toString().padStart(2, '0')}:${minute
          .toString()
          .padStart(2, '0')}`;
      } else {
        const hour = 8 + Math.floor(Math.random() * 2);
        const minute = Math.floor(Math.random() * 4) * 15;
        arrivalTime = `${hour.toString().padStart(2, '0')}:${minute
          .toString()
          .padStart(2, '0')}`;
      }

      let status: 'pending' | 'on_water' | 'completed' | 'canceled';
      if (dayOffset === 0) {
        const rand = Math.random();
        if (rand < 0.3) status = 'pending';
        else if (rand < 0.5) status = 'on_water';
        else if (rand < 0.8) status = 'completed';
        else status = 'canceled';
      } else if (dayOffset === 1) {
        status = Math.random() < 0.85 ? 'pending' : 'canceled';
      } else {
        status = 'pending';
      }

      try {
        await db.createReservation({
          name: clientName,
          date: dateStr,
          nb_people: nbPeople,
          single_canoes: singleCanoes,
          double_canoes: doubleCanoes,
          arrival_time: arrivalTime,
          timeslot: timeslot,
          status: status,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      } catch (error) {
        console.warn(`Erreur création réservation ${i}:`, error);
      }
    }
  }
};

// Corrigez la fonction handleImportData
const handleImportData = async () => {
  if (!db) return;

  Alert.alert(
    'Importer les données',
    'Ceci remplacera toutes les données existantes. Êtes-vous sûr de vouloir continuer ?',
    [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Continuer',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: 'application/json',
              copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets[0]) {
              const fileContent = await FileSystem.readAsStringAsync(
                result.assets[0].uri
              );
              const importResult = await db.importData(fileContent);

              if (importResult.success) {
                Alert.alert('Succès', importResult.message);
                await loadSettings();
              } else {
                Alert.alert('Erreur', importResult.message);
              }
            }
          } catch (error) {
            console.error("Erreur lors de l'import:", error);
            Alert.alert(
              'Erreur',
              "Échec de l'import. Veuillez vérifier le format du fichier."
            );
          }
        },
      },
    ]
  );
};

  const hasChanges =
    tempSettings.total_single_canoes !== settings.total_single_canoes ||
    tempSettings.total_double_canoes !== settings.total_double_canoes ||
    tempSettings.auto_backup_enabled !== settings.auto_backup_enabled ||
    tempSettings.morning_start_time !== settings.morning_start_time ||
    tempSettings.morning_end_time !== settings.morning_end_time ||
    tempSettings.afternoon_start_time !== settings.afternoon_start_time ||
    tempSettings.afternoon_end_time !== settings.afternoon_end_time;

  const totalCanoes = tempSettings.total_single_canoes + tempSettings.total_double_canoes;
  const maxCapacity = tempSettings.total_single_canoes + tempSettings.total_double_canoes * 2;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Title style={styles.headerTitle}>Paramètres</Title>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          Configurer votre entreprise de location de canoës
        </Text>
      </View>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="kayaking"
              size={20}
              color={theme.colors.primary}
            />
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Inventaire des Canoës
            </Text>
          </View>

          <TextInput
            label="Total canoës simples"
            value={tempSettings.total_single_canoes.toString()}
            onChangeText={(text) =>
              setTempSettings((prev) => ({
                ...prev,
                total_single_canoes: parseInt(text) || 0,
              }))
            }
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            right={<TextInput.Icon icon="kayaking" />}
          />

          <TextInput
            label="Total canoës doubles"
            value={tempSettings.total_double_canoes.toString()}
            onChangeText={(text) =>
              setTempSettings((prev) => ({
                ...prev,
                total_double_canoes: parseInt(text) || 0,
              }))
            }
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            right={<TextInput.Icon icon="kayaking" />}
          />

          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                Total canoës :
              </Text>
              <Text variant="bodyLarge" style={styles.summaryValue}>
                {totalCanoes}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                Capacité maximale :
              </Text>
              <Text variant="bodyLarge" style={styles.summaryValue}>
                {maxCapacity} personnes
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Nouvelle section pour les horaires */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={20}
              color={theme.colors.primary}
            />
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Créneaux Horaires et Alertes
            </Text>
          </View>

          <Text variant="bodySmall" style={styles.helpText}>
            Définissez les heures de fonctionnement pour détecter les anomalies temporelles
          </Text>

          <View style={styles.timeSlotContainer}>
            <Text variant="titleSmall" style={styles.timeSlotTitle}>
              🌅 Créneau Matin
            </Text>
            
            <View style={styles.timeRow}>
              <TextInput
                label="Début"
                value={tempSettings.morning_start_time || '09:00'}
                onChangeText={(text) =>
                  setTempSettings((prev) => ({
                    ...prev,
                    morning_start_time: text,
                  }))
                }
                mode="outlined"
                style={styles.timeInput}
                placeholder="09:00"
                right={<TextInput.Icon icon="clock-start" />}
              />
              
              <TextInput
                label="Fin"
                value={tempSettings.morning_end_time || '13:00'}
                onChangeText={(text) =>
                  setTempSettings((prev) => ({
                    ...prev,
                    morning_end_time: text,
                  }))
                }
                mode="outlined"
                style={styles.timeInput}
                placeholder="13:00"
                right={<TextInput.Icon icon="clock-end" />}
              />
            </View>
          </View>

          <View style={styles.timeSlotContainer}>
            <Text variant="titleSmall" style={styles.timeSlotTitle}>
              🌇 Créneau Après-midi
            </Text>
            
            <View style={styles.timeRow}>
              <TextInput
                label="Début"
                value={tempSettings.afternoon_start_time || '14:00'}
                onChangeText={(text) =>
                  setTempSettings((prev) => ({
                    ...prev,
                    afternoon_start_time: text,
                  }))
                }
                mode="outlined"
                style={styles.timeInput}
                placeholder="14:00"
                right={<TextInput.Icon icon="clock-start" />}
              />
              
              <TextInput
                label="Fin"
                value={tempSettings.afternoon_end_time || '18:00'}
                onChangeText={(text) =>
                  setTempSettings((prev) => ({
                    ...prev,
                    afternoon_end_time: text,
                  }))
                }
                mode="outlined"
                style={styles.timeInput}
                placeholder="18:00"
                right={<TextInput.Icon icon="clock-end" />}
              />
            </View>
          </View>

          <View style={styles.alertExplanation}>
            <Text variant="bodySmall" style={styles.alertTitle}>
              🚨 Types d'alertes automatiques :
            </Text>
            <Text variant="bodySmall" style={styles.alertItem}>
              • ⚠️ Réservation après-midi sur l'eau avant {tempSettings.afternoon_start_time}
            </Text>
            <Text variant="bodySmall" style={styles.alertItem}>
              • 🔴 Réservation matin encore sur l'eau après {tempSettings.morning_end_time}
            </Text>
            <Text variant="bodySmall" style={styles.alertItem}>
              • 🔴 Réservation après-midi encore sur l'eau après {tempSettings.afternoon_end_time}
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="backup-restore"
              size={20}
              color={theme.colors.primary}
            />
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Sauvegarde et Gestion des Données
            </Text>
          </View>

          <View style={styles.switchContainer}>
            <View style={styles.switchContent}>
              <Text variant="bodyLarge" style={styles.switchLabel}>
                Sauvegarde automatique
              </Text>
              <Text variant="bodySmall" style={styles.switchDescription}>
                Sauvegarder automatiquement les données quotidiennement
              </Text>
            </View>
            <Switch
              value={tempSettings.auto_backup_enabled}
              onValueChange={(value) =>
                setTempSettings((prev) => ({
                  ...prev,
                  auto_backup_enabled: value,
                }))
              }
            />
          </View>

          {settings.last_backup_date && (
            <Text variant="bodySmall" style={styles.lastBackupText}>
              Dernière sauvegarde :{' '}
              {format(
                new Date(settings.last_backup_date),
                'dd MMM yyyy HH:mm',
                { locale: fr }
              )}
            </Text>
          )}

          <Divider style={styles.divider} />

          <View style={styles.backupButtons}>
            <Button
              mode="outlined"
              onPress={handleExportData}
              loading={backupLoading}
              disabled={backupLoading}
              style={styles.backupButton}
              icon="export"
            >
              Exporter les données
            </Button>

            <Button
              mode="outlined"
              onPress={handleImportData}
              disabled={backupLoading}
              style={styles.backupButton}
              icon="import"
            >
              Importer les données
            </Button>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="test-tube"
              size={20}
              color="#FF6D00"
            />
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: '#FF6D00' }]}>
              Outils de Développement
            </Text>
          </View>

          <Text variant="bodySmall" style={styles.helpText}>
            Outils pour tester l'application avec des données factices
          </Text>

          <Button
            mode="contained"
            onPress={handleGenerateTestData}
            loading={backupLoading}
            disabled={backupLoading}
            style={[styles.testButton, { backgroundColor: '#FF6D00' }]}
            icon="database-plus"
          >
            Générer 50 réservations de test
          </Button>

          <Text variant="bodySmall" style={styles.warningText}>
            ⚠️ Ceci ajoutera des réservations factices pour tester l'application
          </Text>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="titleSmall" style={styles.infoTitle}>
            Notes importantes
          </Text>
          <View style={styles.infoList}>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Les horaires permettent de détecter automatiquement les anomalies temporelles
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Les alertes apparaissent dans la liste des réservations avec des couleurs spécifiques
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Format des heures : HH:MM (ex: 09:30, 14:15)
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Les réservations journée complète bloquent les créneaux matin ET après-midi
            </Text>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={handleSave}
          loading={loading}
          disabled={loading || !hasChanges}
          style={[
            styles.saveButton,
            {
              backgroundColor: hasChanges
                ? theme.colors.primary
                : theme.colors.surfaceVariant,
            },
          ]}
        >
          Sauvegarder les modifications
        </Button>

        <Button
          mode="outlined"
          onPress={handleReset}
          disabled={loading || !hasChanges}
          style={styles.resetButton}
        >
          Réinitialiser
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
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
  card: {
    marginBottom: 16,
    backgroundColor: 'white',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '600',
    color: '#1976D2',
  },
  input: {
    marginBottom: 16,
  },
  summaryContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    color: '#666',
  },
  summaryValue: {
    fontWeight: 'bold',
    color: '#1976D2',
  },
  helpText: {
    color: '#666',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  timeSlotContainer: {
    marginBottom: 20,
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
  },
  timeSlotTitle: {
    fontWeight: '600',
    marginBottom: 12,
    color: '#1976D2',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeInput: {
    flex: 1,
  },
  alertExplanation: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  alertTitle: {
    fontWeight: '600',
    marginBottom: 8,
    color: '#F57C00',
  },
  alertItem: {
    color: '#666',
    marginBottom: 4,
    paddingLeft: 8,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchContent: {
    flex: 1,
  },
  switchLabel: {
    fontWeight: '500',
  },
  switchDescription: {
    color: '#666',
    marginTop: 2,
  },
  lastBackupText: {
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  divider: {
    marginVertical: 16,
  },
  backupButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backupButton: {
    flex: 1,
    borderColor: '#1976D2',
  },
  infoTitle: {
    fontWeight: '600',
    marginBottom: 12,
    color: '#1976D2',
  },
  infoList: {
    gap: 4,
  },
  infoItem: {
    color: '#666',
  },
  buttonContainer: {
    marginTop: 24,
    gap: 12,
  },
  saveButton: {
    paddingVertical: 4,
  },
  resetButton: {
    borderColor: '#666',
  },
  testButton: {
    marginVertical: 8,
  },
  warningText: {
    color: '#FF6D00',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
  },
});