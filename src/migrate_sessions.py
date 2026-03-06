"""
Migration script to backfill sessions table from existing messages
"""
import sqlite3
from database import SQLITE_DB_PATH

def migrate_sessions():
    conn = sqlite3.connect(SQLITE_DB_PATH)
    cursor = conn.cursor()
    
    # Find all unique session_ids from messages that don't exist in sessions
    cursor.execute("""
        SELECT DISTINCT m.session_id
        FROM messages m
        LEFT JOIN sessions s ON m.session_id = s.session_id
        WHERE s.session_id IS NULL AND m.session_id IS NOT NULL
    """)
    
    missing_sessions = cursor.fetchall()
    
    if not missing_sessions:
        print("✓ No missing sessions found. Database is up to date!")
        conn.close()
        return
    
    print(f"Found {len(missing_sessions)} session(s) without entries in sessions table.")
    print("Creating session records with default values...")
    
    # Create session records with default values
    for (session_id,) in missing_sessions:
        # Try to infer role/author from messages if possible
        cursor.execute("""
            SELECT MIN(timestamp)
            FROM messages
            WHERE session_id = ?
        """, (session_id,))
        
        first_msg_time = cursor.fetchone()[0]
        
        # Insert with default values
        cursor.execute("""
            INSERT OR IGNORE INTO sessions (session_id, role, author, created_at)
            VALUES (?, 'student', 'Unknown User', ?)
        """, (session_id, first_msg_time))
        
        print(f"  Created session: {session_id[:8]}... (role: student, author: Unknown User)")
    
    conn.commit()
    
    # Verify migration
    cursor.execute("SELECT COUNT(*) FROM sessions")
    total_sessions = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT session_id) FROM messages")
    total_message_sessions = cursor.fetchone()[0]
    
    print(f"\n✓ Migration complete!")
    print(f"  Sessions table: {total_sessions} records")
    print(f"  Unique sessions in messages: {total_message_sessions}")
    
    conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Session Migration Script")
    print("=" * 60)
    migrate_sessions()
    print("=" * 60)
