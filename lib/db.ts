import mysql from 'mysql2/promise';

function isMySQLConfigured(): boolean {
  return !!(
    process.env.MYSQL_HOST &&
    process.env.MYSQL_USER &&
    process.env.MYSQL_PASSWORD &&
    process.env.MYSQL_DATABASE
  );
}

let _pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!_pool) {
    if (!isMySQLConfigured()) {
      throw new Error('MySQL not configured: set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE');
    }
    _pool = mysql.createPool({
      host: process.env.MYSQL_HOST!,
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER!,
      password: process.env.MYSQL_PASSWORD!,
      database: process.env.MYSQL_DATABASE!,
      ssl: process.env.MYSQL_USE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
    // MySQL 服务端重启后，池内空闲连接会在下一次心跳时报错；若不注册 error
    // 监听，该错误会冒泡成 unhandled error 拖垮进程。
    // mysql2 的 Promise Pool 类型只声明了 'enqueue' 事件，error 事件走 EventEmitter。
    (_pool as unknown as NodeJS.EventEmitter).on("error", (err: Error) => {
      console.error("[db] pool error:", err);
    });
  }
  return _pool;
}

export function isMySQLAvailable(): boolean {
  return isMySQLConfigured();
}

// Use execute() for most queries (prepared statements)
export async function query<T = unknown>(
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<T[]> {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

// Use query() for LIMIT/OFFSET with numeric params (mysql2 quirk: prepared stmts don't support ? for LIMIT/OFFSET)
export async function queryWithLimit<T = unknown>(
  sql: string,
  limit: number,
  offset: number,
  params?: (string | number | boolean | null | Date)[]
): Promise<T[]> {
  const pool = getPool();
  const safeLimit = Math.max(0, Math.floor(Number(limit)));
  const safeOffset = Math.max(0, Math.floor(Number(offset)));
  const finalSql = `${sql} LIMIT ${safeLimit} OFFSET ${safeOffset}`;
  const [rows] = await pool.query(finalSql, params);
  return rows as T[];
}

export async function execute(
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<mysql.ResultSetHeader> {
  const pool = getPool();
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}

// For transactions
export async function getConnection(): Promise<mysql.PoolConnection> {
  return getPool().getConnection();
}

export async function withTransaction<R>(
  fn: (conn: mysql.PoolConnection) => Promise<R>
): Promise<R> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Convenience for raw query within transaction
export async function txQuery<T = unknown>(
  conn: mysql.PoolConnection,
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<T[]> {
  const [rows] = await conn.execute(sql, params);
  return rows as T[];
}

// Convenience for raw execute within transaction
export async function txExecute(
  conn: mysql.PoolConnection,
  sql: string,
  params?: (string | number | boolean | null | Date)[]
): Promise<mysql.ResultSetHeader> {
  const [result] = await conn.execute(sql, params);
  return result as mysql.ResultSetHeader;
}