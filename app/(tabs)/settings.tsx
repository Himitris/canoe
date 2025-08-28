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
import { format } from 'date-fns'; // IMPORT CORRIGÉ
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
  });
  const [tempSettings, setTempSettings] = useState<Settings>({
    total_single_canoes: 10,
    total_double_canoes: 5,
    auto_backup_enabled: true,
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
    tempSettings.auto_backup_enabled !== settings.auto_backup_enabled;

  const totalCanoes =
    tempSettings.total_single_canoes + tempSettings.total_double_canoes;
  const maxCapacity =
    tempSettings.total_single_canoes + tempSettings.total_double_canoes * 2;

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
          <Text variant="titleSmall" style={styles.infoTitle}>
            Notes importantes
          </Text>
          <View style={styles.infoList}>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Les modifications affecteront les calculs de disponibilité
              future
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Les réservations journée complète bloquent les créneaux matin et
              après-midi
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Les réservations existantes ne sont pas affectées par les
              changements d'inventaire
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Les sauvegardes régulières protègent vos données d'entreprise
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
});
