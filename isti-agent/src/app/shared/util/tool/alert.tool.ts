export function alertAction({ text }: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    alert(text);
    resolve('Command console.log executed with text: ' + text.slice(0, 50));
  });
}
