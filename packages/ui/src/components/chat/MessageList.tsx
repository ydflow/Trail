import React from 'react';
import type { Message } from '@finagent/core';
import { TurnCard } from './TurnCard';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <div className="trail-message-list min-w-0 px-0.5 py-0">
      {/* Inside the 400px Copilot panel the shell already pads the body; no max-width rail. */}
      <div className="max-w-none space-y-3">
        {messages.map((message) => (
          <TurnCard key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
};
