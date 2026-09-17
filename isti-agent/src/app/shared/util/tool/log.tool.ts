export function logAction({ text }: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    console.log(text);
    resolve('Command console.log executed with text: ' + text.slice(0, 50));
  });
}
