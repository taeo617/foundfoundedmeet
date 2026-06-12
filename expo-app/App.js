import { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform, BackHandler } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const webViewRef = useRef(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token && webViewRef.current) {
        // Send token to WebView
        const script = `
          try {
            window.postMessage(JSON.stringify({ type: 'EXPO_PUSH_TOKEN', token: '${token}' }), '*');
          } catch(e) {}
          true;
        `;
        setTimeout(() => {
          if (webViewRef.current) {
             webViewRef.current.injectJavaScript(script);
          }
        }, 3000);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url;
      if (url && webViewRef.current) {
        const navScript = `window.location.href = '${url}'; true;`;
        webViewRef.current.injectJavaScript(navScript);
      }
    });

    const backAction = () => {
      if (webViewRef.current) {
        webViewRef.current.goBack();
        return true; 
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => {
      subscription.remove();
      backHandler.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <WebView 
        ref={webViewRef}
        source={{ uri: 'https://foundfoundedmeet.vercel.app' }} 
        style={styles.webview}
        allowsBackForwardNavigationGestures={true}
        onMessage={(event) => {
          // Can handle messages from web
        }}
      />
    </View>
  );
}

async function registerForPushNotificationsAsync() {
  let token;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }
  
  // Try to get token
  try {
    token = (await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig.extra?.eas?.projectId || 'dummy-project-id',
    })).data;
  } catch(e) {
    console.error("Token error:", e);
  }

  return token;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Constants.statusBarHeight || 20,
  },
  webview: {
    flex: 1,
  },
});
