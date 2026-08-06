import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IoniconsName; focused: boolean }) {
  return <Ionicons name={name} size={24} color={focused ? colors.tabActive : colors.tabInactive} />;
}

export default function OwnerTabletLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="pos/index"
        options={{
          title: 'POS',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'cart' : 'cart-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'people' : 'people-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'bar-chart' : 'bar-chart-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'settings' : 'settings-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen name="pos/payment" options={{ href: null }} />
      <Tabs.Screen name="pos/receipt" options={{ href: null }} />
      <Tabs.Screen name="settings/stripe-connect" options={{ href: null }} />
      <Tabs.Screen name="settings/reader" options={{ href: null }} />
      <Tabs.Screen name="settings/tap-to-pay" options={{ href: null }} />
      <Tabs.Screen name="settings/tap-to-pay-location" options={{ href: null }} />
      <Tabs.Screen name="client/[id]" options={{ href: null }} />
      <Tabs.Screen name="client/new" options={{ href: null }} />
      <Tabs.Screen name="appointment/new" options={{ href: null }} />
      <Tabs.Screen name="pos/cash-drawer" options={{ href: null }} />
      <Tabs.Screen name="day-close" options={{ href: null }} />
      <Tabs.Screen name="settings/offline-queue" options={{ href: null }} />
      <Tabs.Screen name="settings/lock-settings" options={{ href: null }} />
    </Tabs>
  );
}
