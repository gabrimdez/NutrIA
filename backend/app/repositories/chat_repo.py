from typing import List, Optional
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.models import ChatSession, ChatMessage


class ChatRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_session(self, user_id: str, title: Optional[str] = None) -> ChatSession:
        session = ChatSession(user_id=user_id, title=title or "Nueva conversación")
        self.db.add(session)
        await self.db.flush()
        return session

    async def get_session(self, session_id: UUID, user_id: str) -> Optional[ChatSession]:
        stmt = (
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.id == session_id, ChatSession.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_sessions(self, user_id: str, limit: int = 20) -> List[ChatSession]:
        stmt = (
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def add_message(self, session_id: UUID, role: str, content: str,
                           tool_calls: Optional[dict] = None,
                           tool_results: Optional[dict] = None) -> ChatMessage:
        message = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            tool_calls=tool_calls,
            tool_results=tool_results,
        )
        self.db.add(message)
        await self.db.flush()
        return message

    async def get_session_messages(self, session_id: UUID, user_id: str, limit: int = 50) -> List[ChatMessage]:
        stmt = (
            select(ChatMessage)
            .join(ChatSession, ChatSession.id == ChatMessage.session_id)
            .where(ChatMessage.session_id == session_id)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatMessage.created_at)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_message_for_user(self, message_id: UUID, user_id: str) -> Optional[ChatMessage]:
        stmt = (
            select(ChatMessage)
            .join(ChatSession, ChatSession.id == ChatMessage.session_id)
            .where(ChatMessage.id == message_id, ChatSession.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_last_training_plan(self, session_id: UUID) -> Optional[dict]:
        """Devuelve el último ``training_plan`` persistido en la sesión, o None.

        Buscamos en ``ChatMessage.tool_results`` (JSON) por el mensaje
        assistant más reciente que contenga la clave ``training_plan``.
        """
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .where(ChatMessage.role == "assistant")
            .order_by(ChatMessage.created_at.desc())
            .limit(20)
        )
        result = await self.db.execute(stmt)
        for row in result.scalars().all():
            tr = row.tool_results
            if isinstance(tr, dict):
                tp = tr.get("training_plan")
                if isinstance(tp, dict) and tp.get("days"):
                    return tp
        return None
