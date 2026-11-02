import React, {useRef, ReactNode} from 'react';

import {observer} from 'mobx-react';

import {Bubble, ChatView, ErrorSnackbar} from '../../components';

import {useChatSession} from '../../hooks';
import {usePendingMessage} from '../../hooks/useDeepLinking';

import {modelStore, chatSessionStore, uiStore} from '../../store';

import {L10nContext} from '../../utils';
import {MessageType} from '../../utils/types';
import {user, assistant} from '../../utils/chat';

const renderBubble = ({
  child,
  message,
  nextMessageInGroup,
  scale,
}: {
  child: ReactNode;
  message: MessageType.Any;
  nextMessageInGroup: boolean;
  scale?: any;
}) => (
  <Bubble
    child={child}
    message={message}
    nextMessageInGroup={nextMessageInGroup}
    scale={scale}
  />
);

export const ChatScreen: React.FC = observer(() => {
  const currentMessageInfo = useRef<{
    createdAt: number;
    id: string;
    sessionId: string;
  } | null>(null);
  const l10n = React.useContext(L10nContext);

  const {handleSendPress, handleStopPress} = useChatSession(
    currentMessageInfo,
    user,
    assistant,
  );

  // Handle deep linking for message prefill
  const {pendingMessage, clearPendingMessage} = usePendingMessage();

  return (
    <>
      <ChatView
        renderBubble={renderBubble}
        messages={chatSessionStore.currentSessionMessages}
        onSendPress={handleSendPress}
        onStopPress={handleStopPress}
        user={user}
        isStopVisible={modelStore.inferencing}
        isStreaming={modelStore.isStreaming}
        sendButtonVisibilityMode="always"
        initialInputText={pendingMessage || undefined}
        onInitialTextConsumed={clearPendingMessage}
        textInputProps={{
          placeholder: !modelStore.engine
            ? modelStore.isContextLoading
              ? l10n.chat.loadingModel
              : l10n.chat.modelNotLoaded
            : l10n.chat.typeYourMessage,
        }}
      />
      {uiStore.chatWarning && (
        <ErrorSnackbar
          error={uiStore.chatWarning}
          onDismiss={() => uiStore.clearChatWarning()}
        />
      )}
      {modelStore.modelLoadError && (
        <ErrorSnackbar
          error={modelStore.modelLoadError}
          onDismiss={() => modelStore.clearModelLoadError()}
        />
      )}
    </>
  );
});
