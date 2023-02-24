import { useEffect, useState } from 'react';
import ReactJson from 'react-json-view';

export function App(): JSX.Element {
  const [tab, setTab] = useState<string | undefined>();
  const [blocks, setBlocks] = useState<object>();
  const [indexes, setIndexes] = useState<Record<string, any>>();

  useEffect(() => {
    async function start() {
      const reqBlocksIndexes = await fetch('data/blocks/index.json');
      const blockIndexes = await reqBlocksIndexes.json();
      setBlocks(blockIndexes.data);
      const reqIndexIndexes = await fetch('data/indexes/index.json');
      const { data } = (await reqIndexIndexes.json()) as {
        data: Array<string>;
      };
      const resps = await Promise.all(
        data.map((index) => fetch(`data/indexes/${index}.json`))
      );
      const indexes = await Promise.all(resps.map((resp) => resp.json()));
      setIndexes(
        Object.fromEntries(
          data.map((datum, index) => [datum, indexes[index].data])
        )
      );
    }

    start();
  }, []);

  function tabClass(name?: string) {
    return `tab tab-bordered ${tab == name ? 'tab-active' : ''}`;
  }

  return (
    <>
      <div className="tabs tabs-boxed">
        {indexes &&
          Object.entries(indexes).map(([name, data], index) => {
            return (
              <a className={`${tabClass(name)}`} onClick={() => setTab(name)}>
                {name}
              </a>
            );
          })}
      </div>
      <div>
        {indexes && indexes[tab!] ? (
          <ReactJson src={indexes[tab!]} collapsed={1} />
        ) : (
          <></>
        )}
        {}
      </div>
    </>
  );
}
