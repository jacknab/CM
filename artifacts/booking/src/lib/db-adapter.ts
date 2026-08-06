export const dbAdapter = {
  from: (table: string) => {
    const queryBuilder = {
      _table: table,
      _operations: [] as Array<{type: string, params: any}>,
      
      select: (columns: string) => {
        queryBuilder._operations.push({ type: 'select', params: columns });
        return queryBuilder;
      },
      
      update: (data: any) => {
        queryBuilder._operations.push({ type: 'update', params: data });
        return queryBuilder;
      },
      
      eq: (column: string, value: any) => {
        queryBuilder._operations.push({ type: 'eq', params: { column, value } });
        return queryBuilder;
      },
      
      order: (column: string, options: any = {}) => {
        queryBuilder._operations.push({ type: 'order', params: { column, options } });
        return queryBuilder;
      },
      
      limit: (limit: number) => {
        queryBuilder._operations.push({ type: 'limit', params: limit });
        return queryBuilder;
      },
    };
    
    // Make it awaitable by implementing Symbol.asyncIterator and then method
    const queryPromise = Promise.resolve({ data: [], error: null }) as any;
    
    // Copy all query builder methods to the promise
    Object.assign(queryPromise, queryBuilder);
    
    return queryPromise;
  },
};