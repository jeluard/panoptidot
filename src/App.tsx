import { useEffect, useState } from 'react';
import ReactJson from 'react-json-view';

export function App(): JSX.Element {
  const [tab, setTab] = useState(1);
  const [blocks, setBlocks] = useState<object>();
  const [indexes, setIndexes] = useState<object>();

  useEffect(() => {
    async function start() {
      const reqBlocksIndexes = await fetch('data/blocks/index.json');
      const blockIndexes = await reqBlocksIndexes.json();
      setBlocks(blockIndexes.data);
      const reqIndexIndexes = await fetch('data/indexes/index.json');
      const { data } = await reqIndexIndexes.json();
      const [block, index] = Object.entries(data)[0];
      const req2 = await fetch(`data/indexes/${block}/${index}.json`);
      const json = await req2.json();
      setIndexes(json.data);
    }

    start();
  }, []);

  function tabClass(index: number) {
    return `tab tab-bordered ${tab == index ? 'tab-active' : ''}`;
  }

  return (
    <>
      <div className="tabs tabs-boxed">
        <a className={`${tabClass(1)}`} onClick={() => setTab(1)}>
          Tab 1
        </a>
        <a className={`${tabClass(2)}`} onClick={() => setTab(2)}>
          Tab 2
        </a>
        <a className={`${tabClass(3)}`} onClick={() => setTab(3)}>
          Tab 3
        </a>
      </div>
      <div>{tab == 1 ? <ReactJson src={indexes || {}} /> : ''}</div>
    </>
  );
}
