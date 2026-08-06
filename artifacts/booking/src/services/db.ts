export const dbSingle = async (table: string, columns: string[] | string, where: any) => {
  return { id: 1, name: 'Placeholder' };
};

export const dbUpdate = async (table: string, values: any, where: any) => {
  return { id: 1, ...values };
};

export const dbSelect = async (table: string, columns: string[] | string, where: any, order: any) => {
  return [{ id: 1, name: 'Placeholder 1' }, { id: 2, name: 'Placeholder 2' }];
};
