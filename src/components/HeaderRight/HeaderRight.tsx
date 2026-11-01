import React, {useContext} from 'react';
import {Alert, Keyboard, View} from 'react-native';

import {observer} from 'mobx-react';
import {IconButton, useTheme} from 'react-native-paper';

import {
  DotsVerticalIcon,
  DuplicateIcon,
  EditBoxIcon,
  EditIcon,
  TrashIcon,
} from '../../assets/icons';

import {Menu} from '../Menu';
import {styles} from './styles';

import {chatSessionStore, uiStore} from '../../store';

import {L10nContext} from '../../utils';

import {RenameModal, UsageStats} from '..';

export const HeaderRight: React.FC = observer(() => {
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [renameModalVisible, setRenameModalVisible] = React.useState(false);

  const openMenu = () => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
    }
    setMenuVisible(true);
  };
  const closeMenu = () => setMenuVisible(false);
  const l10n = useContext(L10nContext);

  const session = chatSessionStore.sessions.find(
    s => s.id === chatSessionStore.activeSessionId,
  );

  const onPressDelete = () => {
    if (session?.id) {
      Alert.alert(
        l10n.components.headerRight.deleteChatTitle,
        l10n.components.headerRight.deleteChatMessage,
        [
          {
            text: l10n.common.cancel,
            style: 'cancel',
          },
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: async () => {
              chatSessionStore.resetActiveSession();
              await chatSessionStore.deleteSession(session.id);
              closeMenu();
            },
          },
        ],
      );
    }
    closeMenu();
  };

  const onPressDuplicate = async () => {
    if (session?.id) {
      await chatSessionStore.duplicateSession(session.id);
      closeMenu();
    }
  };

  const onPressRename = () => {
    setRenameModalVisible(true);
    closeMenu();
  };

  return (
    <View style={styles.headerRightContainer}>
      {uiStore.displayMemUsage && <UsageStats width={40} height={20} />}
      <IconButton
        icon={() => <EditBoxIcon stroke={theme.colors.primary} />}
        testID="reset-button"
        style={styles.chatBtn}
        onPress={() => {
          chatSessionStore.resetActiveSession();
        }}
      />
      {/* Session actions only: there is nothing to act on before a chat exists */}
      {session && (
        <Menu
          visible={menuVisible}
          onDismiss={closeMenu}
          anchorPosition="bottom"
          anchor={
            <IconButton
              icon={() => <DotsVerticalIcon fill={theme.colors.primary} />}
              style={styles.menuBtn}
              onPress={openMenu}
              testID="menu-button"
            />
          }>
          <Menu.Item
            onPress={onPressDuplicate}
            label={l10n.components.headerRight.duplicateChatHistory}
            leadingIcon={() => <DuplicateIcon stroke={theme.colors.primary} />}
          />
          <Menu.Item
            onPress={onPressRename}
            label={l10n.common.rename}
            leadingIcon={() => <EditIcon stroke={theme.colors.primary} />}
          />
          <Menu.Item
            onPress={onPressDelete}
            label={l10n.common.delete}
            labelStyle={{color: theme.colors.error}}
            leadingIcon={() => <TrashIcon stroke={theme.colors.error} />}
          />
        </Menu>
      )}
      {session && (
        <RenameModal
          visible={renameModalVisible}
          onClose={() => setRenameModalVisible(false)}
          session={session}
        />
      )}
    </View>
  );
});
