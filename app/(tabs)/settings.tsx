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
  Divider 
} from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
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
      console.error('Error loading settings:', error);
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

    if (tempSettings.total_single_canoes < 0 || tempSettings.total_double_canoes < 0) {
      Alert.alert('Error', 'Canoe counts cannot be negative');
      return;
    }

    if (tempSettings.total_single_canoes === 0 && tempSettings.total_double_canoes === 0) {
      Alert.alert('Error', 'You must have at least one canoe available');
      return;
    }

    setLoading(true);
    try {
      await db.updateSettings(tempSettings);
      setSettings(tempSettings);
      Alert.alert('Success', 'Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
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
      const fileName = `canoe_backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(fileUri, data);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Canoe Rental Data',
        });
      } else {
        Alert.alert('Success', `Data exported to ${fileName}`);
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      Alert.alert('Error', 'Failed to export data. Please try again.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImportData = async () => {
    if (!db) return;

    Alert.alert(
      'Import Data',
      'This will replace all existing data. Are you sure you want to continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
              });

              if (!result.canceled && result.assets[0]) {
                const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);
                const importResult = await db.importData(fileContent);
                
                if (importResult.success) {
                  Alert.alert('Success', importResult.message);
                  await loadSettings();
                } else {
                  Alert.alert('Error', importResult.message);
                }
              }
            } catch (error) {
              console.error('Error importing data:', error);
              Alert.alert('Error', 'Failed to import data. Please check the file format.');
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

  const totalCanoes = tempSettings.total_single_canoes + tempSettings.total_double_canoes;
  const maxCapacity = tempSettings.total_single_canoes + (tempSettings.total_double_canoes * 2);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Title style={styles.headerTitle}>Settings</Title>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          Configure your canoe rental business
        </Text>
      </View>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="canoe"
              size={20}
              color={theme.colors.primary}
            />
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Canoe Inventory
            </Text>
          </View>

          <TextInput
            label="Total Single Canoes"
            value={tempSettings.total_single_canoes.toString()}
            onChangeText={(text) => 
              setTempSettings(prev => ({
                ...prev,
                total_single_canoes: parseInt(text) || 0
              }))
            }
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            right={<TextInput.Icon icon="canoe" />}
          />

          <TextInput
            label="Total Double Canoes"
            value={tempSettings.total_double_canoes.toString()}
            onChangeText={(text) => 
              setTempSettings(prev => ({
                ...prev,
                total_double_canoes: parseInt(text) || 0
              }))
            }
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            right={<TextInput.Icon icon="canoe" />}
          />

          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                Total Canoes:
              </Text>
              <Text variant="bodyLarge" style={styles.summaryValue}>
                {totalCanoes}
              </Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.summaryLabel}>
                Maximum Capacity:
              </Text>
              <Text variant="bodyLarge" style={styles.summaryValue}>
                {maxCapacity} people
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
              Backup & Data Management
            </Text>
          </View>

          <View style={styles.switchContainer}>
            <View style={styles.switchContent}>
              <Text variant="bodyLarge" style={styles.switchLabel}>
                Auto Backup
              </Text>
              <Text variant="bodySmall" style={styles.switchDescription}>
                Automatically backup data daily
              </Text>
            </View>
            <Switch
              value={tempSettings.auto_backup_enabled}
              onValueChange={(value) =>
                setTempSettings(prev => ({ ...prev, auto_backup_enabled: value }))
              }
            />
          </View>

          {settings.last_backup_date && (
            <Text variant="bodySmall" style={styles.lastBackupText}>
              Last backup: {format(new Date(settings.last_backup_date), 'MMM dd, yyyy HH:mm')}
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
              Export Data
            </Button>
            
            <Button
              mode="outlined"
              onPress={handleImportData}
              disabled={backupLoading}
              style={styles.backupButton}
              icon="import"
            >
              Import Data
            </Button>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="titleSmall" style={styles.infoTitle}>
            Important Notes
          </Text>
          <View style={styles.infoList}>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Changes will affect future availability calculations
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Full day reservations block both morning and afternoon slots
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Existing reservations are not affected by inventory changes
            </Text>
            <Text variant="bodySmall" style={styles.infoItem}>
              • Regular backups help protect your business data
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
            { backgroundColor: hasChanges ? theme.colors.primary : theme.colors.surfaceVariant }
          ]}
        >
          Save Changes
        </Button>
        
        <Button
          mode="outlined"
          onPress={handleReset}
          disabled={loading || !hasChanges}
          style={styles.resetButton}
        >
          Reset
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