pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "openzeppelin-solidity/contracts/token/ERC20/BurnableToken.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

/**
 * @title CryptonityToken
 * @dev ERC20 Criptonity Token
 */
contract CryptonityToken is DetailedERC20, BurnableToken, StandardToken, Ownable {

  string public constant name = "Cryptonity"; // solium-disable-line uppercase
  string public constant symbol = "XNY"; // solium-disable-line uppercase
  uint8 public constant decimals = 18; // solium-disable-line uppercase

  uint256 public constant INITIAL_SUPPLY = 100000000 * (10 ** uint256(decimals)); // solium-disable-line max-len

  /**
  * @dev Constructor that gives msg.sender all of existing tokens.
  */
  constructor() DetailedERC20(name, symbol, decimals) public {
    totalSupply_ = INITIAL_SUPPLY;
    balances[msg.sender] = INITIAL_SUPPLY;
    emit Transfer(address(0), msg.sender, INITIAL_SUPPLY);
  }

  /**
  * @dev burns the provided the _value, can be used only by the owner of the contract.
  * @param _value The value of the tokens to be burnt.
  */
  function burn(uint256 _value) public onlyOwner {
    super.burn(_value);
  }

}